"use client";

import { libelleRepondant } from "@/lib/typesEtablissement";

const JOUR_LABEL: Record<string, string> = {
  Lundi: "Lundi", Mardi: "Mardi", Mercredi: "Mercredi", Jeudi: "Jeudi", Vendredi: "Vendredi", Samedi: "Samedi", Dimanche: "Dimanche",
};
const CRENEAU_LABEL: Record<string, string> = {
  MATIN: "Matin (6h–12h)", APRES_MIDI: "Après-midi (12h–18h)", SOIR: "Soir (18h–23h)", NUIT: "Nuit (23h–6h)",
};
const CATEGORIE_LABEL: Record<string, string> = { MOUSSEUX: "Vins mousseux / Champagnes", RTD: "Cocktails RTD" };

export type VisiteDetail = {
  id: string;
  dateVisite: string;
  commercial: { nom: string; prenom: string };
  repondant?: string | null;
  repondantAutrePrecision?: string | null;
  vendSpiritueux?: boolean | null;
  proposeCocktails?: string | null;
  capaciteEstimee?: string | null;
  salleClimatisee?: boolean | null;
  ecranTv?: boolean | null;
  fournisseurGrossiste?: boolean;
  fournisseurMarche?: boolean;
  fournisseurLivraison?: boolean;
  fournisseurAutre?: boolean;
  fournisseurAutrePrecision?: string | null;
  fournisseurNeSaitPas?: boolean;
  affluence?: { jour: string; creneaux: string[] }[] | null;
  potentielEstime: string | null;
  interesseVisiteCommerciale?: boolean | null;
  veutCommander: boolean | null;
  observations: string | null;
  marquesPresentes?: { id: string; categorie?: string | null; prix?: string | number | null; libelleLibre?: string | null; marque?: { nom: string; categorie?: string | null } | null }[];
};

const oui = (v: boolean | null | undefined) => (v === null || v === undefined ? undefined : v ? "Oui" : "Non");

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-bg-card p-3">
      <h4 className="section-eyebrow mb-2">{titre}</h4>
      {children}
    </section>
  );
}
function Champ({ label, valeur }: { label: string; valeur?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="text-sm font-semibold text-ink">{valeur || "—"}</p>
    </div>
  );
}
const Grille = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-4">{children}</div>;

/** Contenu détaillé d'une visite terrain (offre et potentiel, qualification) — affiché dans la fiche du point de vente. */
export default function DetailVisite({ v }: { v: VisiteDetail }) {
  const affluence = v.affluence || [];
  const marques = v.marquesPresentes || [];
  const fournisseurs = [
    v.fournisseurGrossiste && "Grossiste",
    v.fournisseurMarche && "Marché",
    v.fournisseurLivraison && "Livraison directe",
    v.fournisseurAutre && (v.fournisseurAutrePrecision ? `Autre (${v.fournisseurAutrePrecision})` : "Autre"),
    v.fournisseurNeSaitPas && "Ne sait pas",
  ].filter(Boolean).join(", ");

  return (
    <div className="space-y-3">
      <Bloc titre="Offre et potentiel">
        <Grille>
          <Champ label="Répondant" valeur={v.repondant ? libelleRepondant(v.repondant as never, v.repondantAutrePrecision ?? null) : undefined} />
          <Champ label="Vend des spiritueux" valeur={oui(v.vendSpiritueux)} />
          {v.proposeCocktails && <Champ label="Propose des cocktails" valeur={v.proposeCocktails} />}
          <Champ label="Capacité estimée" valeur={v.capaciteEstimee} />
          <Champ label="Salle climatisée" valeur={oui(v.salleClimatisee)} />
          <Champ label="Écran TV disponible" valeur={oui(v.ecranTv)} />
          <Champ label="Fournisseur actuel" valeur={fournisseurs} />
        </Grille>
        {marques.length > 0 && (
          <div className="mt-3 space-y-3">
            {(["MOUSSEUX", "RTD", null] as const).map((cat) => {
              const lignes = marques.filter((m) => (m.categorie ?? m.marque?.categorie ?? null) === cat);
              if (lignes.length === 0) return null;
              return (
                <div key={cat ?? "autres"}>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{cat ? CATEGORIE_LABEL[cat] : "Autres marques"}</p>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {lignes.map((m) => (
                      <li key={m.id} className="flex items-center justify-between rounded-md bg-bg-elevated px-3 py-1.5 text-sm">
                        <span className="font-semibold text-ink">{m.marque?.nom || m.libelleLibre}</span>
                        <span className="text-ink-muted">{m.prix !== null && m.prix !== undefined ? `${Math.round(Number(m.prix)).toLocaleString("fr-FR")} FCFA` : "Prix non relevé"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {affluence.length > 0 && (
          <div className="mt-3 space-y-0.5 text-sm">
            {affluence.map((a) => (
              <p key={a.jour} className="text-ink-muted">
                {JOUR_LABEL[a.jour] || a.jour} : <span className="font-semibold text-ink">{a.creneaux.map((c) => CRENEAU_LABEL[c] || c).join(", ")}</span>
              </p>
            ))}
          </div>
        )}
      </Bloc>
      <Bloc titre="Qualification commerciale">
        <Grille>
          <Champ label="Potentiel estimé" valeur={v.potentielEstime} />
          <Champ label="Intéressé par une visite" valeur={oui(v.interesseVisiteCommerciale)} />
          <Champ label="Veut commander" valeur={oui(v.veutCommander)} />
        </Grille>
        {v.observations && (
          <p className="mt-3 text-sm">
            <span className="text-ink-muted">Observations : </span>
            <span className="font-medium text-ink">{v.observations}</span>
          </p>
        )}
      </Bloc>
    </div>
  );
}
