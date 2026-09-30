"use client";

import { useCallback, useEffect, useState } from "react";
import { IconTrend, IconUsers, IconStorefront, IconMap, IconPin, IconReceipt, IconDownload, IconPrinter } from "@/components/icons";
import { exporterRapportPdf } from "@/lib/rapportPdf";

type Colonne = { cle: string; label: string; droite?: boolean; montant?: boolean };
type Rapport = {
  groupBy: string;
  colonnes: Colonne[];
  lignes: Record<string, string | number>[];
  totaux: Record<string, number>;
};
type Ville = { id: string; nom: string };
type Commercial = { id: string; nom: string; prenom: string };

// Les filtres (période, agent, ville, quartier) sont communs aux 5
// catégories et NE sont PAS réinitialisés en changeant d'onglet — c'est
// la demande explicite ("maintenir les filtres").
const FILTRES_VIDES = { dateFrom: "", dateTo: "", commercialId: "", villeId: "", quartier: "" };

const CATEGORIES: { valeur: string; label: string; icon: typeof IconUsers }[] = [
  { valeur: "commercial", label: "Par commercial", icon: IconUsers },
  { valeur: "pointVente", label: "Par point de vente", icon: IconStorefront },
  { valeur: "ville", label: "Par ville", icon: IconMap },
  { valeur: "quartier", label: "Par quartier", icon: IconPin },
  { valeur: "vente", label: "Détail des ventes", icon: IconReceipt },
];

const LABEL_CATEGORIE: Record<string, string> = {
  commercial: "Rapport par commercial",
  pointVente: "Rapport par point de vente",
  ville: "Rapport par ville",
  quartier: "Rapport par quartier",
  vente: "Détail des ventes",
};

function formaterCellule(colonne: Colonne, valeur: string | number) {
  if (colonne.montant) return `${Number(valeur).toLocaleString("fr-FR")} FCFA`;
  return valeur === "" || valeur === null || valeur === undefined ? "—" : String(valeur);
}

export default function RapportsPage() {
  const [categorie, setCategorie] = useState("commercial");
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [chargement, setChargement] = useState(true);
  const [villes, setVilles] = useState<Ville[]>([]);
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [export_, setExport] = useState(false);

  useEffect(() => {
    fetch("/api/referentiels").then((r) => r.json()).then((d) => setVilles(d.villes || []));
    fetch("/api/utilisateurs?role=COMMERCIAL").then((r) => r.json()).then((d) => setCommerciaux(d.users || []));
  }, []);

  const charger = useCallback(async () => {
    setChargement(true);
    const s = new URLSearchParams({ groupBy: categorie });
    if (filtres.dateFrom) s.set("dateFrom", filtres.dateFrom);
    if (filtres.dateTo) s.set("dateTo", filtres.dateTo);
    if (filtres.commercialId) s.set("commercialId", filtres.commercialId);
    if (filtres.villeId) s.set("villeId", filtres.villeId);
    if (filtres.quartier) s.set("quartier", filtres.quartier);
    const res = await fetch(`/api/rapports?${s.toString()}`);
    const data = await res.json();
    setRapport(data);
    setChargement(false);
  }, [categorie, filtres]);

  useEffect(() => {
    charger();
  }, [charger]);

  const filtresActifs = JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES);

  function resumeFiltres() {
    const parties: string[] = [];
    if (filtres.dateFrom || filtres.dateTo) {
      parties.push(`Période : ${filtres.dateFrom || "…"} → ${filtres.dateTo || "…"}`);
    }
    if (filtres.commercialId) {
      const c = commerciaux.find((c) => c.id === filtres.commercialId);
      if (c) parties.push(`Commercial : ${c.prenom} ${c.nom}`);
    }
    if (filtres.villeId) {
      const v = villes.find((v) => v.id === filtres.villeId);
      if (v) parties.push(`Ville : ${v.nom}`);
    }
    if (filtres.quartier) parties.push(`Quartier : ${filtres.quartier}`);
    return parties.join(" · ") || "Toutes périodes, tous filtres";
  }

  async function exporterPdf() {
    if (!rapport) return;
    setExport(true);
    try {
      await exporterRapportPdf({
        titre: LABEL_CATEGORIE[categorie],
        sousTitre: resumeFiltres(),
        colonnes: rapport.colonnes,
        lignes: rapport.lignes,
        totaux: rapport.totaux,
      });
    } finally {
      setExport(false);
    }
  }

  return (
    <div>
      <div className="no-print mb-5">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconTrend className="h-5 w-5 text-brass" />
          Rapports
        </h1>
        <p className="text-sm text-ink-muted">
          Performance par commercial, point de vente, ville ou quartier — et détail ligne par ligne des ventes.
        </p>
      </div>

      {/* Onglets de catégorie — les filtres ci-dessous restent identiques
          en changeant d'onglet. */}
      <div className="no-print mb-5 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const actif = categorie === c.valeur;
          return (
            <button
              key={c.valeur}
              onClick={() => setCategorie(c.valeur)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                actif
                  ? "bg-brass text-bg shadow-[0_2px_10px_-2px_rgb(var(--color-brass)/0.55)]"
                  : "border border-line text-ink-muted hover:border-brass/50 hover:text-brass"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="no-print field-card mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Du</label>
          <input type="date" className="field-input max-w-[150px]" value={filtres.dateFrom} onChange={(e) => setFiltres({ ...filtres, dateFrom: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Au</label>
          <input type="date" className="field-input max-w-[150px]" value={filtres.dateTo} onChange={(e) => setFiltres({ ...filtres, dateTo: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Commercial</label>
          <select className="field-input max-w-[180px]" value={filtres.commercialId} onChange={(e) => setFiltres({ ...filtres, commercialId: e.target.value })}>
            <option value="">Tous</option>
            {commerciaux.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Ville</label>
          <select className="field-input max-w-[160px]" value={filtres.villeId} onChange={(e) => setFiltres({ ...filtres, villeId: e.target.value })}>
            <option value="">Toutes</option>
            {villes.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Quartier</label>
          <input className="field-input max-w-[160px]" placeholder="Contient…" value={filtres.quartier} onChange={(e) => setFiltres({ ...filtres, quartier: e.target.value })} />
        </div>
        {filtresActifs && (
          <button className="btn-secondary" onClick={() => setFiltres(FILTRES_VIDES)}>Réinitialiser</button>
        )}
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary" onClick={exporterPdf} disabled={export_ || !rapport}>
            <IconDownload className="h-4 w-4" />
            {export_ ? "Export…" : "Télécharger PDF"}
          </button>
          <button className="btn-secondary" onClick={() => window.print()}>
            <IconPrinter className="h-4 w-4" />
            Imprimer
          </button>
        </div>
      </div>

      {/* En-tête visible seulement à l'impression/dans le PDF — pour situer
          le rapport une fois la nav masquée. */}
      <div className="mb-4 hidden print:block">
        <p className="font-display text-xl text-ink">BELGRAVIA — {LABEL_CATEGORIE[categorie]}</p>
        <p className="text-sm text-ink-muted">{resumeFiltres()}</p>
      </div>

      {rapport && rapport.groupBy !== "vente" && (
        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          <div className="field-card text-center">
            <p className="font-display text-2xl text-ink">{rapport.totaux.pointsVenteRecenses ?? 0}</p>
            <p className="text-xs text-ink-muted">Points de vente recensés</p>
          </div>
          <div className="field-card text-center">
            <p className="font-display text-2xl text-ink">{rapport.totaux.visites ?? 0}</p>
            <p className="text-xs text-ink-muted">Visites</p>
          </div>
          <div className="field-card text-center">
            <p className="font-display text-2xl text-ink">{rapport.totaux.commandes ?? 0}</p>
            <p className="text-xs text-ink-muted">Commandes</p>
          </div>
          <div className="field-card text-center">
            <p className="font-display text-2xl text-ink">{Number(rapport.totaux.montantTotal || 0).toLocaleString("fr-FR")}</p>
            <p className="text-xs text-ink-muted">Total vendu (FCFA)</p>
          </div>
        </div>
      )}

      {rapport && rapport.groupBy === "vente" && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="field-card text-center">
            <p className="font-display text-2xl text-ink">{rapport.lignes.length}</p>
            <p className="text-xs text-ink-muted">Ventes</p>
          </div>
          <div className="field-card text-center">
            <p className="font-display text-2xl text-ink">{Number(rapport.totaux.montantTotal || 0).toLocaleString("fr-FR")}</p>
            <p className="text-xs text-ink-muted">Montant total (FCFA)</p>
          </div>
          <div className="field-card text-center">
            <p className="font-display text-2xl text-danger">{Number(rapport.totaux.resteAPayer || 0).toLocaleString("fr-FR")}</p>
            <p className="text-xs text-ink-muted">Reste à payer (FCFA)</p>
          </div>
        </div>
      )}

      {chargement && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-bg-elevated" />
          ))}
        </div>
      )}

      {!chargement && rapport && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated text-left text-ink-muted">
              <tr>
                {rapport.colonnes.map((c) => (
                  <th key={c.cle} className={`px-4 py-3 font-medium ${c.droite ? "text-right" : ""}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rapport.lignes.map((ligne, i) => (
                <tr key={i} className="border-t border-line hover:bg-bg-card">
                  {rapport.colonnes.map((c) => (
                    <td
                      key={c.cle}
                      className={`px-4 py-3 ${c.droite ? "text-right" : ""} ${
                        c.cle === "label" ? "font-medium text-ink" : "text-ink-muted"
                      } ${c.cle === "resteAPayer" && Number(ligne[c.cle]) > 0 ? "font-medium text-danger" : ""}`}
                    >
                      {formaterCellule(c, ligne[c.cle])}
                    </td>
                  ))}
                </tr>
              ))}
              {rapport.lignes.length === 0 && (
                <tr>
                  <td colSpan={rapport.colonnes.length} className="px-4 py-10 text-center text-ink-muted">
                    Aucune donnée pour ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
            {rapport.lignes.length > 0 && (
              <tfoot className="bg-bg-elevated font-semibold text-ink">
                <tr className="border-t border-line">
                  {rapport.colonnes.map((c, i) => (
                    <td key={c.cle} className={`px-4 py-3 ${c.droite ? "text-right" : ""}`}>
                      {i === 0 ? "Total" : c.cle in rapport.totaux ? formaterCellule(c, rapport.totaux[c.cle]) : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
