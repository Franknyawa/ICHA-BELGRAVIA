import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { libelleTypes, libelleRepondant } from "@/lib/typesEtablissement";

const JOUR_LABEL: Record<string, string> = {
  Lundi: "Lundi", Mardi: "Mardi", Mercredi: "Mercredi", Jeudi: "Jeudi",
  Vendredi: "Vendredi", Samedi: "Samedi", Dimanche: "Dimanche",
};
const CRENEAU_LABEL: Record<string, string> = {
  MATIN: "Matin (6h–12h)",
  APRES_MIDI: "Après-midi (12h–18h)",
  SOIR: "Soir (18h–23h)",
  NUIT: "Nuit (23h–6h)",
};

const CATEGORIE_LABEL: Record<string, string> = {
  MOUSSEUX: "Vins mousseux / Champagnes",
  RTD: "Cocktails RTD",
};

export default async function DetailVisite({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const visite = await prisma.visite.findUnique({
    where: { id: params.id },
    include: {
      pointVente: { include: { ville: true, type: true, typesLies: { include: { type: true } }, createdBy: true } },
      marquesPresentes: { include: { marque: true } },
      photos: true,
    },
  });

  if (!visite) notFound();

  const pv = visite.pointVente;
  const affluence = (visite.affluence as { jour: string; creneaux: string[] }[] | null) || [];

  return (
    <div className="max-w-3xl">
      <Link href="/dashboard" className="text-sm text-ink-muted hover:text-brass-soft">
        ← Retour à la liste
      </Link>

      <h1 className="mt-2 font-display text-3xl text-ink">{pv.nomEtablissement}</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Recensé par {pv.createdBy.prenom} {pv.createdBy.nom} le{" "}
        {new Date(visite.dateVisite).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
      </p>

      {visite.photos.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          {visite.photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.url} alt="Devanture" className="aspect-video w-full rounded-lg object-cover" />
          ))}
        </div>
      )}

      <Section titre="Point de vente & contact sur place">
        <Grid>
          <Champ label="Répondant" valeur={libelleRepondant(visite.repondant, visite.repondantAutrePrecision)} />
          <Champ label="Nom du contact" valeur={pv.nomVendeur} />
          <Champ label="Tél. du contact" valeur={pv.telVendeur} />
          <Champ label="Nom du patron" valeur={pv.nomPatron} />
          <Champ label="Tél. du patron" valeur={pv.telPatron} />
          <Champ label="Ville" valeur={pv.ville?.nom} />
          <Champ label="Quartier" valeur={pv.quartier} />
          <Champ label="Repère" valeur={pv.repereQuartier} />
          <Champ label="Type(s) d'établissement" valeur={libelleTypes(pv)} />
          <div>
            <p className="text-xs text-ink-muted">Position GPS</p>
            {pv.latitude && pv.longitude ? (
              <a
                href={`https://www.google.com/maps?q=${pv.latitude},${pv.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brass hover:underline"
              >
                {String(pv.latitude)}, {String(pv.longitude)} — voir sur la carte
              </a>
            ) : (
              <p className="text-sm text-ink">—</p>
            )}
          </div>
        </Grid>
      </Section>

      <Section titre="Offre & potentiel">
        <Grid>
          <Champ label="Vend des spiritueux" valeur={boolLabel(visite.vendSpiritueux)} />
          {visite.proposeCocktails && <Champ label="Propose des cocktails" valeur={visite.proposeCocktails} />}
          <Champ label="Capacité estimée" valeur={visite.capaciteEstimee} />
          <Champ label="Salle climatisée" valeur={boolLabel(visite.salleClimatisee)} />
          <Champ label="Écran TV disponible" valeur={boolLabel(visite.ecranTv)} />
          <Champ
            label="Fournisseur actuel"
            valeur={
              [
                visite.fournisseurGrossiste && "Grossiste",
                visite.fournisseurMarche && "Marché",
                visite.fournisseurLivraison && "Livraison directe",
                visite.fournisseurAutre && (visite.fournisseurAutrePrecision ? `Autre (${visite.fournisseurAutrePrecision})` : "Autre"),
                visite.fournisseurNeSaitPas && "Ne sait pas",
              ].filter(Boolean).join(", ") || undefined
            }
          />
        </Grid>
        {visite.marquesPresentes.length > 0 && (
          <div className="mt-4 space-y-3">
            {(["MOUSSEUX", "RTD", null] as const).map((cat) => {
              // Catégorie portée par la ligne (nouveaux formulaires) ou, pour
              // les anciennes visites, par la marque du référentiel.
              const lignes = visite.marquesPresentes.filter(
                (m) => (m.categorie ?? m.marque?.categorie ?? null) === cat
              );
              if (lignes.length === 0) return null;
              return (
                <div key={cat ?? "autres"}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {cat ? CATEGORIE_LABEL[cat] : "Autres marques"}
                  </p>
                  <ul className="space-y-1">
                    {lignes.map((m) => (
                      <li key={m.id} className="flex items-center justify-between rounded-md bg-bg-elevated px-3 py-1.5 text-sm">
                        <span className="text-ink">{m.marque?.nom || m.libelleLibre}</span>
                        <span className="text-ink-muted">
                          {m.prix !== null && m.prix !== undefined
                            ? `${Math.round(Number(m.prix)).toLocaleString("fr-FR")} FCFA`
                            : "Prix non relevé"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {affluence.length > 0 && (
          <div className="mt-3 space-y-1 text-sm">
            {affluence.map((a) => (
              <p key={a.jour} className="text-ink-muted">
                {JOUR_LABEL[a.jour] || a.jour} :{" "}
                <span className="text-ink">{a.creneaux.map((c) => CRENEAU_LABEL[c] || c).join(", ")}</span>
              </p>
            ))}
          </div>
        )}
      </Section>

      <Section titre="Qualification commerciale">
        <Grid>
          <Champ label="Potentiel estimé" valeur={visite.potentielEstime} />
          <Champ label="Intéressé par une visite" valeur={boolLabel(visite.interesseVisiteCommerciale)} />
          <Champ label="Veut commander" valeur={boolLabel(visite.veutCommander)} />
        </Grid>
        {visite.observations && (
          <p className="mt-3 text-sm">
            <span className="text-ink-muted">Observations : </span>
            <span className="text-ink">{visite.observations}</span>
          </p>
        )}
      </Section>
    </div>
  );
}

function boolLabel(v: boolean | null) {
  if (v === null || v === undefined) return undefined;
  return v ? "Oui" : "Non";
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="field-card mb-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brass-soft">{titre}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">{children}</div>;
}

function Champ({ label, valeur }: { label: string; valeur?: string | null }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-sm text-ink">{valeur || "—"}</p>
    </div>
  );
}
