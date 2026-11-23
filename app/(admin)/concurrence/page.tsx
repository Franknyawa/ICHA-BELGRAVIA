"use client";

import { useEffect, useState } from "react";
import { IconTrend, IconDownload, IconPrinter } from "@/components/icons";
import { exporterRapportPdf } from "@/lib/rapportPdf";
import { telechargerCsv } from "@/lib/csv";
import { NOM_APP } from "@/lib/marque";
import { Spinner, ChargementPage } from "@/components/Spinner";
import type { RapportConcurrence } from "@/lib/concurrence";

type Onglet = "TOUTES" | "RTD" | "MOUSSEUX" | "NON_CLASSEE";
// Une couleur par catégorie pour les distinguer d'un coup d'œil (barres, pastilles, onglets).
const COULEUR: Record<string, string> = { RTD: "#2E8B7A", MOUSSEUX: "#B8892B", NON_CLASSEE: "#8A8A8A" };
const FILTRES_VIDES = { dateFrom: "", dateTo: "", villeId: "", quartier: "", pointVenteId: "", potentiel: "", typeMode: "inclure" as "inclure" | "exclure" };
const LIBELLE_POTENTIEL: Record<string, string> = { FORT: "Fort", MOYEN: "Moyen", FAIBLE: "Faible", NON_EVALUE: "Non évalué" };
type PointSuggere = { id: string; nomEtablissement: string; quartier: string | null; ville: { nom: string } | null };
const fcfa = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("fr-FR")} FCFA`);
const pct = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

export default function ConcurrencePage() {
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [villes, setVilles] = useState<{ id: string; nom: string }[]>([]);
  const [types, setTypes] = useState<{ id: string; nom: string }[]>([]);
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [rapport, setRapport] = useState<RapportConcurrence | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [onglet, setOnglet] = useState<Onglet>("TOUTES");
  // Sélection d'un point de vente précis : recherche par nom, puis choix dans la liste.
  const [pointChoisi, setPointChoisi] = useState<PointSuggere | null>(null);
  const [recherchePoint, setRecherchePoint] = useState("");
  const [suggestions, setSuggestions] = useState<PointSuggere[]>([]);
  const [listeOuverte, setListeOuverte] = useState(false);

  useEffect(() => {
    if (pointChoisi || recherchePoint.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/points-vente?q=${encodeURIComponent(recherchePoint.trim())}`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => setSuggestions(d.items || []))
        .catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(t);
  }, [recherchePoint, pointChoisi]);

  function choisirPoint(p: PointSuggere | null) {
    setPointChoisi(p);
    setRecherchePoint("");
    setListeOuverte(false);
    setFiltres((f) => ({ ...f, pointVenteId: p?.id ?? "" }));
  }
  const [exportEnCours, setExportEnCours] = useState<"pdf" | "csv" | null>(null);

  useEffect(() => {
    fetch("/api/referentiels").then((r) => r.json()).then((d) => { setVilles(d.villes || []); setTypes(d.types || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(filtres)) if (v && k !== "typeMode") s.set(k, v);
    if (typeIds.length) {
      s.set("typeIds", typeIds.join(","));
      s.set("typeMode", filtres.typeMode);
    }
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
  }, [filtres, typeIds]);

  const visibles = (rapport?.categories ?? []).filter((c) => onglet === "TOUTES" || c.categorie === onglet);
  const libelleOnglet = onglet === "TOUTES" ? "" : (rapport?.categories.find((c) => c.categorie === onglet)?.libelle ?? "");

  const resumeFiltres = () => {
    const p: string[] = [];
    if (libelleOnglet) p.push(`Catégorie : ${libelleOnglet}`);
    if (filtres.dateFrom || filtres.dateTo) p.push(`Période : ${filtres.dateFrom || "…"} → ${filtres.dateTo || "…"}`);
    const ville = villes.find((v) => v.id === filtres.villeId);
    if (ville) p.push(`Ville : ${ville.nom}`);
    if (filtres.quartier) p.push(`Quartier : ${filtres.quartier}`);
    if (typeIds.length) {
      const noms = types.filter((t) => typeIds.includes(t.id)).map((t) => t.nom).join(", ");
      p.push(filtres.typeMode === "exclure" ? `Tous types sauf : ${noms}` : `Types : ${noms}`);
    }
    if (pointChoisi) p.push(`Point de vente : ${pointChoisi.nomEtablissement}`);
    if (filtres.potentiel) p.push(`Potentiel : ${LIBELLE_POTENTIEL[filtres.potentiel]}`);
    p.push(`${rapport?.totalPoints ?? 0} point(s) recensé(s)`);
    return p.join(" · ");
  };

  async function exporterPdf() {
    if (!rapport) return;
    setExportEnCours("pdf");
    try {
      const lignes: Record<string, string | number>[] = [];
      for (const c of visibles) {
        lignes.push({ __groupe: `${c.libelle} — ${c.marques.length} marque${c.marques.length > 1 ? "s" : ""} · présente dans ${c.pointsCouverts} point${c.pointsCouverts > 1 ? "s" : ""} (${pct(c.pourcentageCouverture)})` });
        for (const m of c.marques)
          lignes.push({ marque: m.nom, nbPoints: m.nbPoints, pourcentage: m.pourcentage, prixMoyen: m.prixMoyen ?? "—", prixMin: m.prixMin ?? "—", prixMax: m.prixMax ?? "—" });
      }
      await exporterRapportPdf({
        titre: libelleOnglet ? `Marques concurrentes - ${libelleOnglet}` : "Marques concurrentes",
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
      for (const c of visibles)
        for (const m of c.marques) lignes.push([c.libelle, m.nom, m.nbPoints, rapport.totalPoints, m.pourcentage, m.prixMoyen, m.prixMin, m.prixMax, m.nbPrix]);
      telechargerCsv(onglet === "TOUTES" ? "marques-concurrentes" : `marques-concurrentes-${onglet.toLowerCase()}`, ["Catégorie", "Marque", "Points de vente", "Total points recensés", "% de présence", "Prix moyen (FCFA)", "Prix min (FCFA)", "Prix max (FCFA)", "Relevés de prix"], lignes);
    } finally {
      setExportEnCours(null);
    }
  }

  const aDesDonnees = visibles.length > 0;

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
        <select className="field-input max-w-[170px]" value={filtres.potentiel} onChange={(e) => setFiltres({ ...filtres, potentiel: e.target.value })} aria-label="Potentiel">
          <option value="">Tous les potentiels</option>
          {Object.entries(LIBELLE_POTENTIEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="relative">
          {pointChoisi ? (
            <span className="field-input flex max-w-[260px] items-center gap-2">
              <span className="truncate font-semibold text-ink">{pointChoisi.nomEtablissement}</span>
              <button type="button" onClick={() => choisirPoint(null)} aria-label="Retirer le point de vente" className="text-ink-muted hover:text-danger">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </span>
          ) : (
            <input
              className="field-input max-w-[240px]"
              placeholder="Point de vente (nom)…"
              value={recherchePoint}
              onChange={(e) => { setRecherchePoint(e.target.value); setListeOuverte(true); }}
              onFocus={() => setListeOuverte(true)}
              onBlur={() => setTimeout(() => setListeOuverte(false), 150)}
            />
          )}
          {listeOuverte && suggestions.length > 0 && (
            <ul className="absolute left-0 top-full z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-line bg-bg-elevated shadow-lg">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button type="button" onMouseDown={() => choisirPoint(s)} className="block w-full px-3 py-2 text-left text-sm hover:bg-brass/10">
                    <span className="font-semibold text-ink">{s.nomEtablissement}</span>
                    <span className="block text-xs text-ink-muted">{[s.quartier, s.ville?.nom].filter(Boolean).join(" · ") || "—"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {(filtres.dateFrom || filtres.dateTo || filtres.villeId || filtres.quartier || filtres.pointVenteId || filtres.potentiel || typeIds.length > 0) && (
          <button className="btn-secondary" onClick={() => { setFiltres(FILTRES_VIDES); setTypeIds([]); setPointChoisi(null); setRecherchePoint(""); }}>Réinitialiser</button>
        )}

        {types.length > 0 && (
          <div className="mt-2 w-full border-t border-line pt-3">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-ink">Type de point de vente</span>
              <div className="inline-flex overflow-hidden rounded-full border border-line text-sm font-semibold" role="group" aria-label="Mode du filtre par type">
                {(["inclure", "exclure"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={filtres.typeMode === m}
                    onClick={() => setFiltres({ ...filtres, typeMode: m })}
                    className={`px-4 py-1.5 transition-colors ${filtres.typeMode === m ? "bg-brass text-bg" : "text-ink-muted hover:text-brass"}`}
                  >
                    {m === "inclure" ? "Uniquement" : "Tous sauf"}
                  </button>
                ))}
              </div>
              {typeIds.length > 0 && (
                <button type="button" className="text-sm text-ink-muted underline hover:text-brass" onClick={() => setTypeIds([])}>
                  Tout désélectionner
                </button>
              )}
              {typeIds.length === 0 && <span className="text-xs text-ink-muted">Aucun type coché : tous les types sont inclus.</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {types.map((t) => {
                const coche = typeIds.includes(t.id);
                const exclu = coche && filtres.typeMode === "exclure";
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={coche}
                    onClick={() => setTypeIds(coche ? typeIds.filter((x) => x !== t.id) : [...typeIds, t.id])}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                      coche ? (exclu ? "border-danger bg-danger/10 text-danger line-through" : "border-brass bg-brass/15 text-brass") : "border-line text-ink-muted hover:border-brass hover:text-brass"
                    }`}
                  >
                    {t.nom}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {rapport && rapport.categories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2 no-print" role="tablist" aria-label="Catégorie">
          {([{ cle: "TOUTES", libelle: "Toutes les catégories", nb: rapport.categories.reduce((s, c) => s + c.marques.length, 0) }, ...rapport.categories.map((c) => ({ cle: c.categorie, libelle: c.libelle, nb: c.marques.length }))] as { cle: Onglet; libelle: string; nb: number }[]).map((o) => {
            const actif = onglet === o.cle;
            return (
              <button
                key={o.cle}
                role="tab"
                aria-selected={actif}
                onClick={() => setOnglet(o.cle)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  actif ? "border-brass bg-brass text-bg" : "border-line text-ink-muted hover:border-brass hover:text-brass"
                }`}
              >
                {o.cle !== "TOUTES" && <span className="h-2.5 w-2.5 rounded-full" style={{ background: COULEUR[o.cle] }} />}
                {o.libelle}
                <span className={`rounded-full px-2 py-0.5 text-xs ${actif ? "bg-bg/25" : "bg-brass/10"}`}>{o.nb}</span>
              </button>
            );
          })}
        </div>
      )}

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

          {visibles.map((c) => (
            <section key={c.categorie} className="mb-8 break-inside-avoid">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 font-display text-xl text-ink">
                  <span className="h-3 w-3 rounded-full" style={{ background: COULEUR[c.categorie] }} />
                  {c.libelle}
                </h2>
                <p className="text-sm text-ink-muted">
                  {c.marques.length} marque{c.marques.length > 1 ? "s" : ""} · au moins une présente dans {c.pointsCouverts} point{c.pointsCouverts > 1 ? "s" : ""} ({pct(c.pourcentageCouverture)})
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-line bg-bg-elevated">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-ink-muted" style={{ background: `${COULEUR[c.categorie]}1F`, borderTop: `3px solid ${COULEUR[c.categorie]}` }}>
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
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/60" role="img" aria-label={`${pct(m.pourcentage)} des points`}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, m.pourcentage)}%`, background: COULEUR[c.categorie] }} />
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
