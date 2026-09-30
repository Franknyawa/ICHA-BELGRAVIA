"use client";

import { useEffect, useState } from "react";
import { IconReceipt } from "@/components/icons";
import FactureButton from "@/components/FactureButton";
import { libelleModePaiement, MODES_PAIEMENT } from "@/lib/pricing";

type Ligne = { id: string; quantite: number; prixUnitaire: string; sousTotal: string; produit: { nom: string } | null };
type Commande = {
  id: string;
  createdAt: string;
  dateLivraison: string | null;
  montantTotal: string;
  modePaiement: string;
  mobileMoneyConfirme: boolean;
  montantRecu: string;
  resteAPayer: string;
  pointVente: { nomEtablissement: string; quartier: string | null; ville: { nom: string } | null };
  commercial: { id: string; nom: string; prenom: string };
  lignes: Ligne[];
};
type Agent = { id: string; nom: string; prenom: string };
type Referentiels = { villes: { id: string; nom: string }[] };

const FILTRES_VIDES = { commercialId: "", villeId: "", modePaiement: "", dateFrom: "", dateTo: "" };

export default function FacturesPage() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [ref, setRef] = useState<Referentiels | null>(null);
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [chargement, setChargement] = useState(true);

  function params(p: number) {
    const s = new URLSearchParams({ page: String(p) });
    if (filtres.commercialId) s.set("commercialId", filtres.commercialId);
    if (filtres.villeId) s.set("villeId", filtres.villeId);
    if (filtres.modePaiement) s.set("modePaiement", filtres.modePaiement);
    if (filtres.dateFrom) s.set("dateFrom", filtres.dateFrom);
    if (filtres.dateTo) s.set("dateTo", filtres.dateTo);
    return s;
  }

  async function charger(p = page) {
    setChargement(true);
    const res = await fetch(`/api/commandes?${params(p).toString()}`);
    const data = await res.json();
    setCommandes(data.items || []);
    setTotal(data.total || 0);
    setChargement(false);
  }

  useEffect(() => {
    fetch("/api/utilisateurs?role=COMMERCIAL").then((r) => r.json()).then((d) => setAgents(d.users || []));
    fetch("/api/referentiels").then((r) => r.json()).then(setRef);
  }, []);

  useEffect(() => {
    setPage(1);
    charger(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtres]);

  const montantPage = commandes.reduce((s, c) => s + Number(c.montantTotal), 0);
  const resteAPayerPage = commandes.reduce((s, c) => s + Number(c.resteAPayer), 0);

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconReceipt className="h-5 w-5 text-brass" />
          Factures
        </h1>
        <p className="text-sm text-ink-muted">{total} facture(s) générée(s)</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="field-input max-w-[190px]" value={filtres.commercialId} onChange={(e) => setFiltres({ ...filtres, commercialId: e.target.value })}>
          <option value="">Tous les commerciaux</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
        </select>
        <select className="field-input max-w-[170px]" value={filtres.villeId} onChange={(e) => setFiltres({ ...filtres, villeId: e.target.value })}>
          <option value="">Toutes les villes</option>
          {ref?.villes.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
        </select>
        <select className="field-input max-w-[180px]" value={filtres.modePaiement} onChange={(e) => setFiltres({ ...filtres, modePaiement: e.target.value })}>
          <option value="">Tous les modes</option>
          {MODES_PAIEMENT.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <input type="date" className="field-input max-w-[150px]" value={filtres.dateFrom} onChange={(e) => setFiltres({ ...filtres, dateFrom: e.target.value })} />
        <input type="date" className="field-input max-w-[150px]" value={filtres.dateTo} onChange={(e) => setFiltres({ ...filtres, dateTo: e.target.value })} />
        {JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES) && (
          <button className="btn-secondary" onClick={() => setFiltres(FILTRES_VIDES)}>Réinitialiser</button>
        )}
      </div>

      {!chargement && commandes.length > 0 && (
        <p className="mb-4 text-sm text-ink-muted">
          Total (page courante) : <span className="font-semibold text-ink">{montantPage.toLocaleString("fr-FR")} FCFA</span>
          {resteAPayerPage > 0 && (
            <span className="ml-3 font-semibold text-danger">
              Reste à payer : {resteAPayerPage.toLocaleString("fr-FR")} FCFA
            </span>
          )}
        </p>
      )}

      <div className="space-y-3">
        {commandes.map((c) => (
          <div key={c.id} className="field-card">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink">
                  N° {c.id.slice(0, 8).toUpperCase()} — {c.pointVente.nomEtablissement}
                </p>
                <p className="text-xs text-ink-muted">
                  {c.pointVente.ville?.nom} · {c.commercial.prenom} {c.commercial.nom} ·{" "}
                  {libelleModePaiement(c.modePaiement)}
                  {c.modePaiement === "MOBILE_MONEY" && !c.mobileMoneyConfirme ? " (non confirmé)" : ""} ·{" "}
                  {new Date(c.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  {c.dateLivraison ? ` · Livraison prévue le ${new Date(c.dateLivraison).toLocaleDateString("fr-FR")}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display text-xl text-ink">{Number(c.montantTotal).toLocaleString("fr-FR")}</span>
                <FactureButton commande={c} />
              </div>
            </div>
            {Number(c.resteAPayer) > 0 && (
              <p className="text-sm font-medium text-danger">
                Reste à payer : {Number(c.resteAPayer).toLocaleString("fr-FR")} FCFA
              </p>
            )}
          </div>
        ))}
        {!chargement && commandes.length === 0 && (
          <p className="field-card text-center text-sm text-ink-muted">Aucune facture ne correspond à ces filtres.</p>
        )}
      </div>

      {total > 20 && (
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); charger(p); }}>
            Précédent
          </button>
          <span className="flex items-center px-2 text-sm text-ink-muted">Page {page}</span>
          <button className="btn-secondary" disabled={page * 20 >= total} onClick={() => { const p = page + 1; setPage(p); charger(p); }}>
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
