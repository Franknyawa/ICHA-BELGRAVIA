"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose, IconPrinter } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { NOM_APP, SIGNATURE_APP } from "@/lib/marque";
import type { DetailRapport } from "@/lib/rapportDetail";

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

/** 484 120 -> "484 k", 1 250 000 -> "1,25 M" : tient au-dessus d'une barre étroite. */
function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M`;
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k`;
  return String(Math.round(n));
}

/** Histogramme en simples <div> : s'imprime fidèlement, sans dépendre d'une mesure d'écran. */
function Barres({ titre, data, format }: { titre: string; data: { label: string; valeur: number }[]; format: (n: number) => string }) {
  const max = Math.max(...data.map((d) => d.valeur), 0);
  return (
    <div className="bloc-impression rounded-lg border border-line p-3">
      <p className="mb-3 text-xs font-semibold text-ink">{titre}</p>
      {max === 0 ? (
        <p className="py-6 text-center text-xs text-ink-muted">Aucune vente sur la période.</p>
      ) : (
        <div className="flex h-36 items-end gap-1">
          {data.map((d) => (
            <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.label} : ${format(d.valeur)}`}>
              <span className="mb-0.5 text-center text-[9px] leading-none text-ink-muted tabular-nums">
                {d.valeur > 0 ? compact(d.valeur) : ""}
              </span>
              <div
                className="rounded-t bg-brass"
                style={{ height: `${d.valeur > 0 ? Math.max((d.valeur / max) * 78, 2) : 0}%`, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
              />
              <span className="mt-1 flex flex-col items-center text-[9px] leading-[1.15] text-ink-muted">
                <span>{d.label.split(" ")[0]}</span>
                <span className="opacity-60">{d.label.split(" ")[1] || ""}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tableau({ colonnes, lignes, droite }: { colonnes: string[]; lignes: (string | number)[][]; droite: number[] }) {
  return (
    <div className="bloc-impression overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-xs">
        <thead className="bg-bg-elevated text-left text-ink-muted">
          <tr>
            {colonnes.map((c, i) => (
              <th key={c} className={`px-3 py-2 font-medium ${droite.includes(i) ? "text-right" : ""}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-t border-line">
              {l.map((v, j) => (
                <td key={j} className={`px-3 py-1.5 tabular-nums ${droite.includes(j) ? "text-right" : ""} ${j === 0 ? "font-medium text-ink" : "text-ink-muted"}`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Aperçu d'une seule ligne de rapport (commercial, point de vente, ville,
 * quartier, produit ou commande), imprimable seul : à l'impression, tout le
 * reste de la page est masqué (voir app/globals.css, .apercu-racine).
 */
export default function ApercuRapport({
  groupBy,
  id,
  parametres,
  resumeFiltres,
  onClose,
}: {
  groupBy: string;
  id: string;
  parametres: string; // filtres déjà encodés (sans groupBy ni id)
  resumeFiltres: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DetailRapport | null>(null);
  const [erreur, setErreur] = useState("");
  const [monte, setMonte] = useState(false);

  useEffect(() => setMonte(true), []);

  useEffect(() => {
    let annule = false;
    setDetail(null);
    setErreur("");
    fetch(`/api/rapports/detail?groupBy=${encodeURIComponent(groupBy)}&id=${encodeURIComponent(id)}&${parametres}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Impossible de charger le détail.");
        if (!annule) setDetail(d);
      })
      .catch((e) => !annule && setErreur(e.message));
    return () => {
      annule = true;
    };
  }, [groupBy, id, parametres]);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", touche);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", touche);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  function imprimer() {
    document.body.classList.add("imprimer-apercu");
    const nettoyer = () => {
      document.body.classList.remove("imprimer-apercu");
      window.removeEventListener("afterprint", nettoyer);
    };
    window.addEventListener("afterprint", nettoyer);
    window.print();
  }

  if (!monte) return null;

  const estCommande = groupBy === "vente";
  const aDesVentes = detail ? detail.kpis.some((k) => k.label === "Commandes" && Number(k.valeur) > 0) : false;

  return createPortal(
    <div
      className="apercu-racine fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-3 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu du rapport"
    >
      <div className="apercu-feuille relative w-full max-w-4xl rounded-xl border border-line bg-bg shadow-2xl">
        <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-xl border-b border-line bg-bg-elevated px-4 py-3">
          <p className="text-sm font-medium text-ink">Aperçu du rapport</p>
          <div className="flex gap-2">
            <button className="btn-primary !px-4 !py-2" onClick={imprimer} disabled={!detail}>
              <IconPrinter className="h-4 w-4" />
              Imprimer
            </button>
            <button className="btn-secondary !px-3 !py-2" onClick={onClose} aria-label="Fermer">
              <IconClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          {!detail && !erreur && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
              <Spinner className="h-4 w-4" /> Chargement du détail…
            </div>
          )}
          {erreur && <p className="py-12 text-center text-sm text-danger">{erreur}</p>}

          {detail && (
            <div className="space-y-5">
              <header className="border-b border-line pb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brass">
                  {NOM_APP} · {SIGNATURE_APP}
                </p>
                <h2 className="mt-1 font-display text-2xl text-ink">{detail.titre}</h2>
                <p className="text-sm text-ink-muted">{detail.soustitre}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {groupBy === "historique" ? "12 derniers mois" : resumeFiltres} · Généré le {new Date().toLocaleDateString("fr-FR")}
                </p>
              </header>

              {detail.infos.length > 0 && (
                <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  {detail.infos.map((i) => (
                    <div key={i.label} className="flex gap-2">
                      <dt className="w-24 shrink-0 text-ink-muted">{i.label}</dt>
                      <dd className="text-ink">{i.valeur}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                {detail.kpis.map((k) => (
                  <div key={k.label} className="bloc-impression rounded-lg border border-line p-3">
                    <p className="text-[11px] text-ink-muted">{k.label}</p>
                    <p className="font-display text-xl text-ink tabular-nums">
                      {k.montant ? fcfa(Number(k.valeur)) : Number(k.valeur).toLocaleString("fr-FR")}
                    </p>
                  </div>
                ))}
              </div>

              {estCommande && detail.lignesCommande && (
                <Tableau
                  colonnes={["Produit", "Cartons", "Prix / carton", "Sous-total"]}
                  droite={[1, 2, 3]}
                  lignes={detail.lignesCommande.map((l) => [l.produit, l.quantite, fcfa(l.prixUnitaire), fcfa(l.sousTotal)])}
                />
              )}

              {!estCommande && aDesVentes && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Barres titre="Chiffre d'affaires par mois (FCFA)" data={detail.parMois.map((m) => ({ label: m.label, valeur: m.montantTotal }))} format={fcfa} />
                  <Barres titre="Cartons vendus par mois" data={detail.parMois.map((m) => ({ label: m.label, valeur: m.cartons }))} format={(n) => `${n} cartons`} />
                </div>
              )}

              {!estCommande && detail.parProduit.length > 0 && groupBy !== "produit" && (
                <section>
                  <p className="mb-2 text-sm font-semibold text-ink">Produits vendus</p>
                  <Tableau
                    colonnes={["Produit", "Cartons", "Chiffre d'affaires", "% du CA"]}
                    droite={[1, 2, 3]}
                    lignes={detail.parProduit.map((p) => [
                      p.label,
                      p.cartons.toLocaleString("fr-FR"),
                      fcfa(p.montantTotal),
                      `${p.partCA.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`,
                    ])}
                  />
                </section>
              )}

              {detail.classement && detail.classement.lignes.length > 0 && (
                <section>
                  <p className="mb-2 text-sm font-semibold text-ink">{detail.classement.titre}</p>
                  <Tableau
                    colonnes={["Nom", "Commandes", "Cartons", "Chiffre d'affaires"]}
                    droite={[1, 2, 3]}
                    lignes={detail.classement.lignes.map((l) => [
                      l.sousLabel ? `${l.label} (${l.sousLabel})` : l.label,
                      l.commandes,
                      l.cartons.toLocaleString("fr-FR"),
                      fcfa(l.montantTotal),
                    ])}
                  />
                </section>
              )}

              {!estCommande && detail.commandes.length > 0 && (
                <section>
                  <p className="mb-2 text-sm font-semibold text-ink">Commandes{detail.commandesTronquees ? " (les plus récentes)" : ""}</p>
                  <Tableau
                    colonnes={["Date", "Point de vente", "Commercial", "Cartons", "Montant", "Reste à payer"]}
                    droite={[3, 4, 5]}
                    lignes={detail.commandes.map((c) => [c.date, c.pointVente, c.commercial, c.cartons, fcfa(c.montantTotal), c.resteAPayer > 0 ? fcfa(c.resteAPayer) : "—"])}
                  />
                </section>
              )}

              {!estCommande && !aDesVentes && (
                <p className="rounded-lg border border-line p-6 text-center text-sm text-ink-muted">Aucune vente pour cette sélection.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
