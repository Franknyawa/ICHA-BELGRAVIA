"use client";

import { useEffect, useState } from "react";
import { IconTrend, IconDownload, IconPrinter } from "@/components/icons";
import { exporterRapportPdf } from "@/lib/rapportPdf";
import { telechargerCsv } from "@/lib/csv";
import { NOM_APP } from "@/lib/marque";
import { Spinner, ChargementPage } from "@/components/Spinner";
import type { RapportConcurrence } from "@/lib/concurrence";

const FILTRES_VIDES = { dateFrom: "", dateTo: "", villeId: "", quartier: "" };
const fcfa = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("fr-FR")} FCFA`);
const pct = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

export default function ConcurrencePage() {
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [villes, setVilles] = useState<{ id: string; nom: string }[]>([]);
  const [rapport, setRapport] = useState<RapportConcurrence | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [exportEnCours, setExportEnCours] = useState<"pdf" | "csv" | null>(null);

  useEffect(() => {
    fetch("/api/referentiels").then((r) => r.json()).then((d) => setVilles(d.villes || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(filtres)) if (v) s.set(k, v);
    setChargement(true);
    setErreur("");
    const t = setTimeout(
      () =>
        fetch(`/api/rapports/concurrence?${s}`)
          .then(async (r) => {
            if (!r.ok) throw new Error();
            setRapport(await r.json());
          })
          .catch(() => setErreur("Impossible de charger le rapport."))
          .finally(() => setChargement(false)),
      filtres.quartier ? 350 : 0
    );
    return () => clearTimeout(t);
  }, [filtres]);

  const resumeFiltres = () => {
    const p: string[] = [];
    if (filtres.dateFrom || filtres.dateTo) p.push(`Période : ${filtres.dateFrom || "…"} → ${filtres.dateTo || "…"}`);
    const ville = villes.find((v) => v.id === filtres.villeId);
    if (ville) p.push(`Ville : ${ville.nom}`);
    if (filtres.quartier) p.push(`Quartier : ${filtres.quartier}`);
    p.push(`${rapport?.totalPoints ?? 0} point(s) recensé(s)`);
    return p.join(" · ");
  };

  async function exporterPdf() {
    if (!rapport) return;
    setExportEnCours("pdf");
    try {
      const lignes: Record<string, string | number>[] = [];
      for (const c of rapport.categories) {
        lignes.push({ __groupe: `${c.libelle} — ${c.marques.length} marque${c.marques.length > 1 ? "s" : ""} · présente dans ${c.pointsCouverts} point${c.pointsCouverts > 1 ? "s" : ""} (${pct(c.pourcentageCouverture)})` });
        for (const m of c.marques)
          lignes.push({ marque: m.nom, nbPoints: m.nbPoints, pourcentage: m.pourcentage, prixMoyen: m.prixMoyen ?? "—", prixMin: m.prixMin ?? "—", prixMax: m.prixMax ?? "—" });
      }
      await exporterRapportPdf({
        titre: "Marques concurrentes",
        sousTitre: resumeFiltres(),
        colonnes: [
          { cle: "marque", label: "Marque" },
          { cle: "nbPoints", label: "Points de vente", droite: true },
          { cle: "pourcentage", label: "% de présence", droite: true, pourcentage: true },
          { cle: "prixMoyen", label: "Prix moyen", droite: true, montant: true },
          { cle: "prixMin", label: "Prix min.", droite: true, montant: true },
          { cle: "prixMax", label: "Prix max.", droite: true, montant: true },
        ],
        lignes,
        totaux: {},
      });
    } finally {
      setExportEnCours(null);
    }
  }

  function exporterCsv() {
    if (!rapport) return;
    setExportEnCours("csv");
    try {
      const lignes: (string | number | null)[][] = [];
      for (const c of rapport.categories)
        for (const m of c.marques) lignes.push([c.libelle, m.nom, m.nbPoints, rapport.totalPoints, m.pourcentage, m.prixMoyen, m.prixMin, m.prixMax, m.nbPrix]);
      telechargerCsv("marques-concurrentes", ["Catégorie", "Marque", "Points de vente", "Total points recensés", "% de présence", "Prix moyen (FCFA)", "Prix min (FCFA)", "Prix max (FCFA)", "Relevés de prix"], lignes);
    } finally {
      setExportEnCours(null);
    }
  }

  const aDesDonnees = !!rapport && rapport.categories.length > 0;

  return (
    <div className="pb-16">
      <div className="mb-5 hidden print:block">
        <h1 className="font-display text-2xl text-ink">{NOM_APP} — Marques concurrentes</h1>
        <p className="text-sm text-ink-muted">{resumeFiltres()}</p>
        <p className="text-xs text-ink-muted">Généré le {new Date().toLocaleDateString("fr-FR")}</p>
      </div>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 no-print">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
            <IconTrend className="h-5 w-5 text-brass" />
            Marques concurrentes
          </h1>
          <p className="text-sm text-ink-muted">
            Marques relevées dans les points de vente, par catégorie : prix constatés et part des points où elles sont présentes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={!aDesDonnees || exportEnCours !== null} onClick={exporterPdf}>
            {exportEnCours === "pdf" ? <Spinner className="h-4 w-4" /> : <IconDownload className="h-4 w-4" />}
            PDF
          </button>
          <button className="btn-secondary" disabled={!aDesDonnees || exportEnCours !== null} onClick={exporterCsv}>
            <IconDownload className="h-4 w-4" />
            CSV
          </button>
          <button className="btn-secondary" disabled={!aDesDonnees} onClick={() => window.print()}>
            <IconPrinter className="h-4 w-4" />
            Imprimer
          </button>
        </div>
      </div>

      <div className="field-card mb-6 flex flex-wrap items-center gap-2 no-print">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Du
          <input type="date" className="field-input max-w-[160px]" value={filtres.dateFrom} onChange={(e) => setFiltres({ ...filtres, dateFrom: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          au
          <input type="date" className="field-input max-w-[160px]" value={filtres.dateTo} onChange={(e) => setFiltres({ ...filtres, dateTo: e.target.value })} />
        </label>
        <select className="field-input max-w-[180px]" value={filtres.villeId} onChange={(e) => setFiltres({ ...filtres, villeId: e.target.value })}>
          <option value="">Toutes les villes</option>
          {villes.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
        </select>
        <input className="field-input max-w-[180px]" placeholder="Quartier…" value={filtres.quartier} onChange={(e) => setFiltres({ ...filtres, quartier: e.target.value })} />
        {(filtres.dateFrom || filtres.dateTo || filtres.villeId || filtres.quartier) && (
          <button className="btn-secondary" onClick={() => setFiltres(FILTRES_VIDES)}>Réinitialiser</button>
        )}
      </div>

      {chargement && !rapport ? (
        <ChargementPage />
      ) : erreur ? (
        <p className="field-card text-sm text-danger">{erreur}</p>
      ) : !aDesDonnees ? (
        <p className="field-card text-sm text-ink-muted">Aucune marque relevée pour ces filtres.</p>
      ) : (
        <div className={chargement ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <p className="mb-4 text-sm text-ink-muted">
            Base : <strong className="text-ink">{rapport!.totalPoints}</strong> point{rapport!.totalPoints > 1 ? "s" : ""} de vente recensé{rapport!.totalPoints > 1 ? "s" : ""}. Un point compte une fois, d'après sa visite la plus récente
            {filtres.dateFrom || filtres.dateTo ? " dans la période" : ""}.
          </p>

          {rapport!.categories.map((c) => (
            <section key={c.categorie} className="mb-8 break-inside-avoid">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl text-ink">{c.libelle}</h2>
                <p className="text-sm text-ink-muted">
                  {c.marques.length} marque{c.marques.length > 1 ? "s" : ""} · au moins une présente dans {c.pointsCouverts} point{c.pointsCouverts > 1 ? "s" : ""} ({pct(c.pourcentageCouverture)})
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-line bg-bg-elevated">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-brass/10 text-xs uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="px-4 py-3">Marque</th>
                      <th className="px-4 py-3 text-right">Points de vente</th>
                      <th className="w-56 px-4 py-3">% de présence</th>
                      <th className="px-4 py-3 text-right">Prix moyen</th>
                      <th className="px-4 py-3 text-right">Min.</th>
                      <th className="px-4 py-3 text-right">Max.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {c.marques.map((m) => (
                      <tr key={m.nom}>
                        <td className="px-4 py-3 font-semibold text-ink">{m.nom}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{m.nbPoints}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-brass/15" role="img" aria-label={`${pct(m.pourcentage)} des points`}>
                              <div className="h-full rounded-full bg-brass" style={{ width: `${Math.min(100, m.pourcentage)}%` }} />
                            </div>
                            <span className="w-14 text-right tabular-nums">{pct(m.pourcentage)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fcfa(m.prixMoyen)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-muted">{fcfa(m.prixMin)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-muted">{fcfa(m.prixMax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <p className="text-xs text-ink-muted">
            Les prix sont ceux relevés en rayon par les agents (moyenne, minimum et maximum sur les points où la marque est présente). Les visites faites avant la saisie des prix comptent dans la présence mais pas dans les prix.
          </p>
        </div>
      )}
    </div>
  );
}
