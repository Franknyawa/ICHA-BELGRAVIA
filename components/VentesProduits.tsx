"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { IconBox, IconTrend } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { styleBadgeGamme } from "@/lib/gammesClient";

type Mesure = "cartons" | "montantTotal";
type Point = { label: string; cartons: number; montantTotal: number };
type Classe = {
  id: string;
  nom: string;
  gamme: string;
  gammeCode: string;
  cartons: number;
  montantTotal: number;
  commandes: number;
  partCartons: number;
  partCA: number;
};
type Top = { label: string; sousLabel: string; cartons: number; montantTotal: number };
type Reponse = {
  periode: string;
  totalCartons: number;
  totalCA: number;
  classement: Classe[];
  selectionId: string | null;
  detail: {
    id: string;
    nom: string;
    gamme: string;
    cartons: number;
    montantTotal: number;
    commandes: number;
    pointsVente: number;
    prixMoyen: number;
    parMois: Point[];
    parJour: Point[];
    topPointsVente: Top[];
    topQuartiers: Top[];
    tendance: { cartons30j: number; cartonsPrec30j: number; variationPct: number | null };
  } | null;
};

const PERIODES = [
  { valeur: "7", label: "7 jours" },
  { valeur: "30", label: "30 jours" },
  { valeur: "90", label: "3 mois" },
  { valeur: "365", label: "12 mois" },
  { valeur: "tout", label: "Depuis le début" },
];

// Une seule teinte (l'or de la marque) : les graphiques montrent UNE mesure à la fois,
// donc la couleur n'a pas à distinguer des séries — la mise en avant passe par l'opacité.
const OR = "rgb(var(--color-brass))";
const ENCRE_DISCRETE = "rgb(var(--color-ink-muted))";

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
const nombre = (n: number) => Math.round(n).toLocaleString("fr-FR");

/** 484 120 -> "484 k" ; 1 250 000 -> "1,3 M" : lisible sur un axe étroit. */
function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k`;
  return String(Math.round(n));
}

const styleTexteInfobulle = { color: "rgb(var(--color-ink))" };

const styleInfobulle = {
  borderRadius: 8,
  border: "1px solid rgb(var(--color-line))",
  background: "rgb(var(--color-bg-elevated))",
  fontSize: 12,
};

export default function VentesProduits({ gammeId }: { gammeId: string }) {
  const [periode, setPeriode] = useState("tout");
  const [mesure, setMesure] = useState<Mesure>("cartons");
  const [produitId, setProduitId] = useState("");
  const [data, setData] = useState<Reponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);

  // Changer de gamme ou de période : on repart du produit le plus vendu.
  useEffect(() => setProduitId(""), [gammeId, periode]);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(false);
    const s = new URLSearchParams({ periode });
    if (gammeId) s.set("gammeId", gammeId);
    if (produitId) s.set("produitId", produitId);
    fetch(`/api/tableau-de-bord/produits?${s}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !annule && setData(d))
      .catch(() => !annule && setErreur(true))
      .finally(() => !annule && setChargement(false));
    return () => {
      annule = true;
    };
  }, [gammeId, periode, produitId]);

  const valeur = (x: { cartons: number; montantTotal: number }) => x[mesure];
  const format = (n: number) => (mesure === "cartons" ? `${nombre(n)} cartons` : fcfa(n));
  const formatAxe = (n: number) => (mesure === "cartons" ? nombre(n) : compact(n));

  const classement = data ? [...data.classement].sort((a, b) => valeur(b) - valeur(a)) : [];
  const meilleur = classement[0];
  const top = classement.slice(0, 10);
  const detail = data?.detail;
  const variation = detail?.tendance.variationPct ?? null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <p className="section-eyebrow">Ventes par produit</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-line p-0.5 text-xs" role="group" aria-label="Mesure">
            {([
              ["cartons", "Cartons"],
              ["montantTotal", "Chiffre d'affaires"],
            ] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setMesure(v)}
                aria-pressed={mesure === v}
                className={`rounded-full px-3 py-1.5 font-medium transition-colors ${mesure === v ? "bg-brass text-bg" : "text-ink-muted hover:text-brass"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <select className="field-input !w-auto !py-1.5 text-xs" value={periode} onChange={(e) => setPeriode(e.target.value)} aria-label="Période">
            {PERIODES.map((p) => (
              <option key={p.valeur} value={p.valeur}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {chargement && !data && (
        <div className="field-card flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Spinner className="h-4 w-4" /> Chargement des ventes par produit…
        </div>
      )}
      {erreur && <p className="field-card text-sm text-danger">Impossible de charger les ventes par produit.</p>}

      {data && classement.length === 0 && !erreur && (
        <p className="field-card py-10 text-center text-sm text-ink-muted">Aucune vente de produit sur cette période.</p>
      )}

      {data && classement.length > 0 && meilleur && (
        <div className={chargement ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {/* Le produit qui se vend le mieux */}
          <div className="field-card mb-4 flex flex-wrap items-center gap-5 border-brass/30 bg-gradient-to-br from-bg-card to-bg-elevated">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
              <IconBox className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-muted">
                Produit le plus vendu · {mesure === "cartons" ? "en cartons" : "en chiffre d'affaires"}
              </p>
              <p className="truncate font-display text-2xl text-ink">{meilleur.nom}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${styleBadgeGamme(meilleur.gammeCode)}`}>
                {meilleur.gamme}
              </span>
            </div>
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-ink-muted">Cartons vendus</dt>
                <dd className="font-display text-xl text-ink tabular-nums">{nombre(meilleur.cartons)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Chiffre d'affaires</dt>
                <dd className="font-display text-xl text-ink tabular-nums">{fcfa(meilleur.montantTotal)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Part des ventes</dt>
                <dd className="font-display text-xl text-ink tabular-nums">
                  {(mesure === "cartons" ? meilleur.partCartons : meilleur.partCA).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                </dd>
              </div>
            </dl>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {/* Colonne gauche : classement, puis meilleurs points de vente et quartiers du produit choisi */}
            <div className="space-y-4">
            <div className="field-card">
              <p className="mb-1 text-sm font-semibold text-ink">Classement des produits</p>
              <p className="mb-3 text-xs text-ink-muted">Clique sur un produit pour voir ses graphiques.</p>
              <ResponsiveContainer width="100%" height={Math.max(top.length * 38 + 16, 120)}>
                <BarChart data={top} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap="28%">
                  <XAxis type="number" hide domain={[0, "dataMax"]} />
                  <YAxis
                    type="category"
                    dataKey="nom"
                    width={118}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: ENCRE_DISCRETE }}
                    tickFormatter={(v: string) => (v.length > 17 ? `${v.slice(0, 16)}…` : v)}
                  />
                  <Tooltip
                    cursor={{ fill: "rgb(var(--color-brass) / 0.08)" }}
                    formatter={(v) => [format(Number(v)), ""]}
                    separator=""
                    labelFormatter={(l) => String(l)}
                    contentStyle={styleInfobulle} itemStyle={styleTexteInfobulle} labelStyle={styleTexteInfobulle}
                  />
                  <Bar
                    dataKey={mesure}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={22}
                    cursor="pointer"
                    onClick={(d) => {
                      const x = d as unknown as { id?: string; payload?: { id?: string } };
                      const id = x.id ?? x.payload?.id;
                      if (id) setProduitId(String(id));
                    }}
                  >
                    {top.map((p) => (
                      <Cell key={p.id} fill={OR} fillOpacity={p.id === data.selectionId ? 1 : 0.45} />
                    ))}
                    <LabelList
                      dataKey={mesure}
                      position="right"
                      formatter={(v) => formatAxe(Number(v))}
                      style={{ fontSize: 11, fill: ENCRE_DISCRETE }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {detail && detail.topPointsVente.length > 0 && (
              <Palmares titre="Meilleurs points de vente" sous={detail.nom} lignes={detail.topPointsVente} mesure={mesure} format={format} />
            )}
            {detail && detail.topQuartiers.length > 0 && (
              <Palmares titre="Meilleurs quartiers" sous={detail.nom} lignes={detail.topQuartiers} mesure={mesure} format={format} />
            )}
            </div>

            {/* Détail du produit choisi */}
            {detail && (
              <div className="field-card">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-ink-muted">Graphiques du produit</p>
                    <p className="truncate font-display text-xl text-ink">{detail.nom}</p>
                  </div>
                  <select
                    className="field-input !w-auto max-w-[200px] !py-1.5 text-xs"
                    value={detail.id}
                    onChange={(e) => setProduitId(e.target.value)}
                    aria-label="Choisir un produit"
                  >
                    {classement.map((p) => (
                      <option key={p.id} value={p.id}>{p.nom}</option>
                    ))}
                  </select>
                </div>

                <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Cartons", nombre(detail.cartons)],
                    ["Chiffre d'affaires", fcfa(detail.montantTotal)],
                    ["Commandes", nombre(detail.commandes)],
                    ["Points de vente", nombre(detail.pointsVente)],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <dt className="text-[11px] text-ink-muted">{l}</dt>
                      <dd className="font-display text-lg text-ink tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>

                {variation !== null && (
                  <p className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${variation >= 0 ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
                    <IconTrend className={`h-3.5 w-3.5 ${variation < 0 ? "-scale-y-100" : ""}`} />
                    {variation >= 0 ? "+" : ""}{variation} % sur 30 jours (vs 30 jours précédents)
                  </p>
                )}

                <p className="mb-1 text-xs font-semibold text-ink">
                  Évolution sur 12 mois · {mesure === "cartons" ? "cartons" : "FCFA"}
                </p>
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={detail.parMois} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--color-line))" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 10, fill: ENCRE_DISCRETE }} />
                    <YAxis width={44} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: ENCRE_DISCRETE }} tickFormatter={formatAxe} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "rgb(var(--color-brass) / 0.08)" }}
                      formatter={(v) => [format(Number(v)), ""]}
                      separator=""
                      contentStyle={styleInfobulle} itemStyle={styleTexteInfobulle} labelStyle={styleTexteInfobulle}
                    />
                    <Bar dataKey={mesure} fill={OR} radius={[4, 4, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>

                <p className="mb-1 mt-4 text-xs font-semibold text-ink">
                  30 derniers jours · {mesure === "cartons" ? "cartons par jour" : "FCFA par jour"}
                </p>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={detail.parJour} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--color-line))" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval={4} tick={{ fontSize: 10, fill: ENCRE_DISCRETE }} />
                    <YAxis width={44} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: ENCRE_DISCRETE }} tickFormatter={formatAxe} allowDecimals={false} />
                    <Tooltip formatter={(v) => [format(Number(v)), ""]} separator="" contentStyle={styleInfobulle} itemStyle={styleTexteInfobulle} labelStyle={styleTexteInfobulle} />
                    <Area type="monotone" dataKey={mesure} stroke={OR} strokeWidth={2} fill={OR} fillOpacity={0.14} activeDot={{ r: 4, stroke: "rgb(var(--color-bg-elevated))", strokeWidth: 2 }} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

        </div>
      )}
    </section>
  );
}

/** Petit classement avec barre proportionnelle (tient en 5 lignes, pas besoin d'un vrai graphique). */
function Palmares({ titre, sous, lignes, mesure, format }: { titre: string; sous: string; lignes: Top[]; mesure: Mesure; format: (n: number) => string }) {
  const tri = [...lignes].sort((a, b) => b[mesure] - a[mesure]);
  const max = Math.max(...tri.map((l) => l[mesure]), 1);
  return (
    <div className="field-card">
      <p className="truncate text-sm font-semibold text-ink">{titre}</p>
      <p className="mb-3 truncate text-xs text-ink-muted">{sous}</p>
      <ol className="space-y-2.5">
        {tri.map((l, i) => (
          <li key={`${l.label}-${i}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink">
                <span className="mr-2 text-xs text-ink-muted tabular-nums">{i + 1}.</span>
                {l.label}
                {l.sousLabel && <span className="ml-1.5 text-xs text-ink-muted">{l.sousLabel}</span>}
              </span>
              <span className="shrink-0 text-xs text-ink-muted tabular-nums">{format(l[mesure])}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-line/60">
              <div className="h-full rounded-full bg-brass" style={{ width: `${Math.max((l[mesure] / max) * 100, 3)}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
