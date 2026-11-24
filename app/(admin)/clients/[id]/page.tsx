"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { IconStorefront, IconPhone, IconPin, IconClipboard, IconMap, IconPrinter, IconDownload, IconReceipt, IconCalendar } from "@/components/icons";
import { ChargementPage } from "@/components/Spinner";
import { nombreFr } from "@/lib/format";
import { exporterClientPdf, montantPdf } from "@/lib/clientPdf";

type Cmd = {
  id: string;
  numeroFV?: string | null;
  avoirsTotal?: number;
  documentsCorrectifs?: { id: string; type: "FR" | "FA"; numero: string; montant: number; createdAt: string }[];
  dateCommande: string;
  livreeLe: string | null;
  statut: "NON_TRAITEE" | "EN_COURS_LIVRAISON" | "LIVREE";
  montantTotal: number;
  modePaiement: string;
  commercial: { nom: string; prenom: string };
  lignes: { quantite: number; libelleLibre: string | null; produit: { nom: string } | null }[];
};
type Enc = { id: string; commandeId: string | null; montant: number; libelle: string; dateOperation: string };
type Client = {
  id: string;
  nomEtablissement: string;
  nomVendeur: string | null;
  telVendeur: string | null;
  nomPatron: string | null;
  telPatron: string | null;
  quartier: string | null;
  repereQuartier: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  ville: { nom: string } | null;
  type: { nom: string } | null;
  createdBy: { nom: string; prenom: string };
  visites: { id: string; dateVisite: string; commercial: { nom: string; prenom: string } }[];
  commandes: Cmd[];
};

const STATUT: Record<string, { label: string; cls: string }> = {
  NON_TRAITEE: { label: "Non traitée", cls: "bg-danger/10 text-danger" },
  EN_COURS_LIVRAISON: { label: "Validée — à livrer", cls: "bg-brass text-white" },
  LIVREE: { label: "Livrée", cls: "bg-ok text-white" },
};
const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" });
const numero = (id: string) => `FAC-${id.slice(0, 8).toUpperCase()}`;

function Kpi({ titre, valeur, note, ton }: { titre: string; valeur: string; note: string; ton?: string }) {
  return (
    <div className="field-card !p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">{titre}</p>
      <p className={`montant mt-1 text-2xl ${ton || "text-ink"}`}>{valeur}</p>
      <p className="mt-0.5 text-xs font-medium text-ink-muted">{note}</p>
    </div>
  );
}

export default function ClientProfilPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [encs, setEncs] = useState<Enc[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    fetch(`/api/clients/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erreur de chargement.");
        setClient(d.client);
        setEncs(d.encaissements);
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false));
  }, [id]);

  const calc = useMemo(() => {
    if (!client) return null;
    const encParCmd = new Map<string, number>();
    for (const e of encs) if (e.commandeId) encParCmd.set(e.commandeId, (encParCmd.get(e.commandeId) || 0) + e.montant);
    const validees = client.commandes.filter((c) => c.statut !== "NON_TRAITEE");
    const factures = validees.map((c) => {
      const enc = encParCmd.get(c.id) || 0;
      return { c, net: c.montantTotal - (c.avoirsTotal || 0), enc, reste: Math.max(0, c.montantTotal - (c.avoirsTotal || 0) - enc) };
    });
    const facturation = validees.reduce((s, c) => s + c.montantTotal - (c.avoirsTotal || 0), 0);
    const encaisse = encs.reduce((s, e) => s + e.montant, 0);
    const mouvements = [
      ...validees.map((c) => ({ date: c.dateCommande, piece: c.numeroFV ?? numero(c.id), libelle: `Commande validée (${c.lignes.reduce((s, l) => s + l.quantite, 0)} cartons)`, debit: c.montantTotal, credit: 0 })),
      ...validees.flatMap((c) =>
        (c.documentsCorrectifs || []).map((d) => ({ date: d.createdAt, piece: d.numero, libelle: d.type === "FR" ? "Facture retour" : "Facture d'avoir", debit: 0, credit: d.montant }))
      ),
      ...encs.map((e) => ({ date: e.dateOperation, piece: "Caisse", libelle: e.libelle, debit: e.montant < 0 ? -e.montant : 0, credit: e.montant < 0 ? 0 : e.montant })),
    ].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    let solde = 0;
    const releve = mouvements.map((m) => ({ ...m, solde: (solde += m.debit - m.credit) }));
    return { factures, facturation, encaisse, reste: Math.max(0, facturation - encaisse), releve };
  }, [client, encs]);

  if (chargement) return <ChargementPage label="Chargement du profil client…" />;
  if (!client || !calc) return (
    <div>
      <Link href="/clients" className="mb-3 inline-block text-sm text-ink-muted hover:text-brass">← Retour aux clients</Link>
      <p className="text-sm text-danger">{erreur || "Client introuvable."}</p>
    </div>
  );

  const tel = client.telVendeur || client.telPatron;
  const sousTitre = [client.type?.nom, client.ville?.nom, client.quartier].filter(Boolean).join(" · ");
  const contactTxt = [client.nomVendeur || client.nomPatron, tel].filter(Boolean).join(" — ");

  async function pdf(mode: "FICHE" | "RELEVE") {
    if (!client || !calc) return;
    await exporterClientPdf({
      mode,
      nom: client.nomEtablissement,
      sousTitre,
      contact: contactTxt,
      kpis: [
        { label: "Passages", valeur: String(client.visites.length) },
        { label: "Facturation", valeur: montantPdf(calc.facturation) },
        { label: "Encaissé", valeur: montantPdf(calc.encaisse) },
        { label: "Reste à encaisser", valeur: montantPdf(calc.reste) },
      ],
      factures: calc.factures.map((f) => [f.c.numeroFV ?? numero(f.c.id), dateFr(f.c.dateCommande), montantPdf(f.net), montantPdf(f.enc), montantPdf(f.reste)]),
      releve: calc.releve.map((m) => [dateFr(m.date), m.piece, m.libelle, m.debit ? montantPdf(m.debit) : "", m.credit ? montantPdf(m.credit) : "", montantPdf(m.solde)]),
    });
  }

  const carte = client.latitude != null && client.longitude != null ? `https://www.google.com/maps?q=${client.latitude},${client.longitude}` : null;

  return (
    <div className="w-full space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href="/clients" className="text-sm font-medium text-ink-muted hover:text-brass">← Retour aux clients</Link>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => pdf("FICHE")}>
            <IconClipboard className="h-4 w-4" />
            Fiche PDF
          </button>
          <button className="btn-secondary" onClick={() => window.print()}>
            <IconPrinter className="h-4 w-4" />
            Imprimer
          </button>
          <button className="btn-primary" onClick={() => pdf("RELEVE")}>
            <IconDownload className="h-4 w-4" />
            Télécharger PDF
          </button>
        </div>
      </div>

      <section className="field-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
              <IconStorefront className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-2xl text-ink">{client.nomEtablissement}</h1>
              <p className="text-sm font-medium text-ink-muted">{sousTitre || "—"}</p>
              <p className="text-xs text-ink-muted">
                Recensé par {client.createdBy.prenom} {client.createdBy.nom} le {dateFr(client.createdAt)}
              </p>
            </div>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Link href={`/points-de-vente/${client.id}`} className="btn-secondary">
              <IconClipboard className="h-4 w-4" />
              Données recensées
            </Link>
            {carte && (
              <a href={carte} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                <IconMap className="h-4 w-4" />
                Voir sur la carte
              </a>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-bg-elevated p-3">
            <p className="section-eyebrow mb-1">
              <IconPhone className="h-4 w-4" />
              Interlocuteur
            </p>
            <p className="text-sm font-bold text-ink">{client.nomVendeur || client.nomPatron || "Non renseigné"}</p>
            <p className="text-xs text-ink-muted">{client.nomVendeur ? "Vendeur / répondant" : client.nomPatron ? "Patron" : ""}</p>
            {tel && <p className="mt-0.5 text-sm text-ink">{tel}</p>}
            {client.nomVendeur && client.nomPatron && (
              <p className="text-xs text-ink-muted">Patron : {[client.nomPatron, client.telPatron].filter(Boolean).join(" — ")}</p>
            )}
          </div>
          <div className="rounded-lg bg-bg-elevated p-3">
            <p className="section-eyebrow mb-1">
              <IconPin className="h-4 w-4" />
              Localisation
            </p>
            <p className="text-sm text-ink">{[client.ville?.nom, client.quartier].filter(Boolean).join(" · ") || "Non renseignée"}</p>
            {client.repereQuartier && <p className="text-xs text-ink-muted">Repère : {client.repereQuartier}</p>}
            {client.latitude != null && (
              <p className="text-xs text-ink-muted">
                GPS : {client.latitude.toFixed(5)}, {client.longitude?.toFixed(5)}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titre="Passages" valeur={String(client.visites.length)} note="Visites terrain" />
        <Kpi titre="Facturation (débit)" valeur={nombreFr(calc.facturation)} note="Commandes validées" />
        <Kpi titre="Caisse (crédit)" valeur={nombreFr(calc.encaisse)} note="Encaissé en caisse" ton="text-ok" />
        <Kpi titre="Reste à encaisser" valeur={nombreFr(calc.reste)} note="Le client doit" ton={calc.reste > 0 ? "text-danger" : "text-ok"} />
      </div>

      <section className="field-card overflow-x-auto">
        <h2 className="section-eyebrow mb-2">Factures et situation</h2>
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
              <th className="py-1.5">Facture</th><th>Date</th><th className="text-right">Montant</th><th className="text-right">Encaissé</th><th className="text-right">Reste</th>
            </tr>
          </thead>
          <tbody>
            {calc.factures.map((f) => (
              <tr key={f.c.id} className="border-b border-line/60">
                <td className="py-1.5 font-semibold text-ink">{f.c.numeroFV ?? numero(f.c.id)}</td>
                <td className="text-ink-muted">{dateFr(f.c.dateCommande)}</td>
                <td className="montant text-right">{nombreFr(f.net)}</td>
                <td className="montant text-right text-ok">{nombreFr(f.enc)}</td>
                <td className={`montant text-right ${f.reste > 0 ? "text-danger" : "text-ok"}`}>{nombreFr(f.reste)}</td>
              </tr>
            ))}
            {calc.factures.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">Aucune commande validée pour l'instant.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="field-card overflow-x-auto">
        <h2 className="section-eyebrow mb-2">Relevé de compte (journal débit / crédit)</h2>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
              <th className="py-1.5">Date</th><th>Pièce</th><th>Libellé</th><th className="text-right">Débit</th><th className="text-right">Crédit</th><th className="text-right">Solde</th>
            </tr>
          </thead>
          <tbody>
            {calc.releve.map((m, i) => (
              <tr key={i} className="border-b border-line/60">
                <td className="py-1.5 text-ink-muted">{dateFr(m.date)}</td>
                <td className="font-semibold text-ink">{m.piece}</td>
                <td className="text-ink">{m.libelle}</td>
                <td className="montant text-right">{m.debit ? nombreFr(m.debit) : ""}</td>
                <td className="montant text-right text-ok">{m.credit ? nombreFr(m.credit) : ""}</td>
                <td className="montant text-right">{nombreFr(m.solde)}</td>
              </tr>
            ))}
            {calc.releve.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-ink-muted">Aucun mouvement.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="field-card">
        <h2 className="section-eyebrow mb-2">
          <IconReceipt className="h-4 w-4" />
          Commandes ({client.commandes.length})
        </h2>
        <ul className="divide-y divide-line/60">
          {client.commandes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="w-24 text-sm text-ink-muted">{dateFr(c.dateCommande)}</span>
              <span className="min-w-0 flex-1 basis-48 truncate text-sm text-ink">
                {c.lignes.map((l) => `${l.produit?.nom || l.libelleLibre || "Produit"} × ${l.quantite}`).join(", ")}
              </span>
              <span className="montant text-base text-ink">{nombreFr(c.montantTotal)} <span className="montant-unite">FCFA</span></span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUT[c.statut].cls}`}>{STATUT[c.statut].label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="field-card">
        <h2 className="section-eyebrow mb-2">
          <IconCalendar className="h-4 w-4" />
          Dates de passage chez le client
        </h2>
        {client.visites.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun passage enregistré.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {client.visites.map((v) => (
              <span key={v.id} title={`${v.commercial.prenom} ${v.commercial.nom}`} className="rounded-md bg-bg-elevated px-2 py-1 text-xs font-semibold text-ink ring-1 ring-line">
                {dateFr(v.dateVisite)}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
