"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { IconDownload, IconStorefront, IconCheckCircle, IconClipboard, IconTrend, IconMap, IconRoute } from "@/components/icons";
import SuiviTerrain from "@/components/SuiviTerrain";
import { peut } from "@/lib/permissions";
import { Spinner, ChargementPage } from "@/components/Spinner";

const CarteBelgravia = dynamic(() => import("@/components/CarteBelgravia"), {
  ssr: false,
  loading: () => <ChargementPage compact label="Chargement de la carte…" />,
});

type Repartition = { label: string; count: number };
type Stats = {
  total: number;
  interesses: number;
  veulentCommander: number;
  parPotentiel: Repartition[];
  parType: Repartition[];
  parVille: Repartition[];
  parAgent: Repartition[];
};
type PointCarte = { id: string; nom: string; statut: string; lat: number; lng: number; potentiel: string | null };

export default function StatistiquesPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [points, setPoints] = useState<PointCarte[] | null>(null);
  const [vue, setVue] = useState<"points" | "suivi">("points");
  const [peutSuivre, setPeutSuivre] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => setPeutSuivre(peut(d.role, "tracking"))).catch(() => {});
    if (new URLSearchParams(window.location.search).get("vue") === "suivi") setVue("suivi");
  }, []);

  useEffect(() => {
    fetch("/api/statistiques").then((r) => r.json()).then(setStats);
    fetch("/api/points-vente/carte").then((r) => r.json()).then((d) => setPoints(d.points));
  }, []);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconMap className="h-5 w-5 text-brass" />
          Carte
        </h1>
        {vue === "points" && (
          <a href="/api/visites/export" className="btn-secondary">
            <IconDownload className="h-4 w-4" />
            Exporter en CSV
          </a>
        )}
      </div>

      {peutSuivre && (
        <div className="mb-5 inline-flex rounded-lg border border-line bg-bg-elevated p-1">
          {([["points", "Points de vente", IconStorefront], ["suivi", "Suivi des commerciaux", IconRoute]] as const).map(([v, label, Ic]) => (
            <button
              key={v}
              type="button"
              onClick={() => setVue(v)}
              className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-bold transition-colors ${vue === v ? "bg-brass text-bg shadow-sm" : "text-ink-muted hover:text-ink"}`}
            >
              <Ic className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {vue === "suivi" && peutSuivre && <SuiviTerrain />}
      {vue === "points" && (<>

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Carte label="Points de vente recensés" valeur={stats.total} icon={IconStorefront} />
          <Carte label="Intéressés par une visite" valeur={stats.interesses} icon={IconCheckCircle} />
          <Carte label="Veulent commander" valeur={stats.veulentCommander} icon={IconClipboard} />
          <Carte
            label="Taux de conversion visite"
            valeur={stats.total ? `${Math.round((stats.interesses / stats.total) * 100)}%` : "—"}
            icon={IconTrend}
          />
        </div>
      )}

      <div className="mb-6 field-card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brass-soft">
          Carte des points de vente
        </h2>
        {points && <CarteBelgravia points={points} />}
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Repartitions titre="Potentiel estimé" data={stats.parPotentiel} />
          <Repartitions titre="Par type d'établissement" data={stats.parType} />
          <Repartitions titre="Par ville" data={stats.parVille} />
          <Repartitions titre="Par agent" data={stats.parAgent} />
        </div>
      )}
      </>)}
    </div>
  );
}

function Carte({
  label,
  valeur,
  icon: Icon,
}: {
  label: string;
  valeur: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="field-card">
      <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-brass/10 text-brass">
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="font-display text-3xl text-ink">{valeur}</p>
    </div>
  );
}

function Repartitions({ titre, data }: { titre: string; data: Repartition[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="field-card">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brass-soft">{titre}</h3>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.label}>
            <div className="mb-1 flex justify-between text-xs text-ink-muted">
              <span>{d.label}</span>
              <span>{d.count}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-bg-elevated">
              <div className="h-1.5 rounded-full bg-brass" style={{ width: `${(d.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {data.length === 0 && <p className="text-sm text-ink-muted">Aucune donnée pour le moment.</p>}
      </div>
    </div>
  );
}
