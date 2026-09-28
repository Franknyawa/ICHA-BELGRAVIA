"use client";

import { useEffect, useState } from "react";
import { IconTrend } from "@/components/icons";

type Rapport = {
  commercial: { id: string; nom: string; prenom: string; actif: boolean };
  pointsVenteRecenses: number;
  visites: number;
  commandes: number;
  montantTotal: number | string;
  resteAPayer: number | string;
};

const FILTRES_VIDES = { dateFrom: "", dateTo: "" };

export default function RapportsPage() {
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [chargement, setChargement] = useState(true);

  async function charger() {
    setChargement(true);
    const s = new URLSearchParams();
    if (filtres.dateFrom) s.set("dateFrom", filtres.dateFrom);
    if (filtres.dateTo) s.set("dateTo", filtres.dateTo);
    const res = await fetch(`/api/rapports?${s.toString()}`);
    const data = await res.json();
    setRapports(data.rapports || []);
    setChargement(false);
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtres]);

  const totaux = rapports.reduce(
    (acc, r) => ({
      pointsVenteRecenses: acc.pointsVenteRecenses + r.pointsVenteRecenses,
      visites: acc.visites + r.visites,
      commandes: acc.commandes + r.commandes,
      montantTotal: acc.montantTotal + Number(r.montantTotal),
      resteAPayer: acc.resteAPayer + Number(r.resteAPayer),
    }),
    { pointsVenteRecenses: 0, visites: 0, commandes: 0, montantTotal: 0, resteAPayer: 0 }
  );

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconTrend className="h-5 w-5 text-brass" />
          Rapports par commercial
        </h1>
        <p className="text-sm text-ink-muted">Performance de chaque agent — recensement, visites et ventes.</p>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Du</label>
          <input type="date" className="field-input max-w-[150px]" value={filtres.dateFrom} onChange={(e) => setFiltres({ ...filtres, dateFrom: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Au</label>
          <input type="date" className="field-input max-w-[150px]" value={filtres.dateTo} onChange={(e) => setFiltres({ ...filtres, dateTo: e.target.value })} />
        </div>
        {JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES) && (
          <button className="btn-secondary" onClick={() => setFiltres(FILTRES_VIDES)}>Réinitialiser</button>
        )}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="field-card text-center">
          <p className="text-2xl font-display text-ink">{totaux.pointsVenteRecenses}</p>
          <p className="text-xs text-ink-muted">Points de vente recensés</p>
        </div>
        <div className="field-card text-center">
          <p className="text-2xl font-display text-ink">{totaux.visites}</p>
          <p className="text-xs text-ink-muted">Visites</p>
        </div>
        <div className="field-card text-center">
          <p className="text-2xl font-display text-ink">{totaux.commandes}</p>
          <p className="text-xs text-ink-muted">Commandes</p>
        </div>
        <div className="field-card text-center">
          <p className="text-2xl font-display text-ink">{totaux.montantTotal.toLocaleString("fr-FR")}</p>
          <p className="text-xs text-ink-muted">Total vendu (FCFA)</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-left text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Commercial</th>
              <th className="px-4 py-3 font-medium">Points de vente recensés</th>
              <th className="px-4 py-3 font-medium">Visites</th>
              <th className="px-4 py-3 font-medium">Commandes</th>
              <th className="px-4 py-3 font-medium">Montant vendu</th>
              <th className="px-4 py-3 font-medium">Reste à payer</th>
            </tr>
          </thead>
          <tbody>
            {rapports.map((r) => (
              <tr key={r.commercial.id} className="border-t border-line hover:bg-bg-card">
                <td className="px-4 py-3">
                  <span className="font-medium text-ink">{r.commercial.prenom} {r.commercial.nom}</span>
                  {!r.commercial.actif && <span className="ml-2 text-xs text-ink-muted">(désactivé)</span>}
                </td>
                <td className="px-4 py-3 text-ink-muted">{r.pointsVenteRecenses}</td>
                <td className="px-4 py-3 text-ink-muted">{r.visites}</td>
                <td className="px-4 py-3 text-ink-muted">{r.commandes}</td>
                <td className="px-4 py-3 font-medium text-ink">{Number(r.montantTotal).toLocaleString("fr-FR")}</td>
                <td className={`px-4 py-3 font-medium ${Number(r.resteAPayer) > 0 ? "text-danger" : "text-ink-muted"}`}>
                  {Number(r.resteAPayer).toLocaleString("fr-FR")}
                </td>
              </tr>
            ))}
            {!chargement && rapports.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                  Aucun commercial trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
