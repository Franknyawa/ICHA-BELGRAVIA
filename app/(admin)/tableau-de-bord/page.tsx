"use client";

import { useEffect, useState } from "react";
import BarreGraphique from "@/components/BarreGraphique";
import GammeTabs from "@/components/GammeTabs";
import type { GammeInfo } from "@/lib/gammesClient";
import {
  IconChart,
  IconStorefront,
  IconReceipt,
  IconTrend,
  IconCheckCircle,
} from "@/components/icons";

type TableauDeBord = {
  visitesAujourdhui: number;
  pointVenteTotal: number;
  commandesAujourdhui: number;
  caTotal: number;
  caDuJour: number;
  interessesTotal: number;
  visitesTotal: number;
  tauxConversion: number;
  parPotentiel: { label: string; valeur: number }[];
  parType: { label: string; valeur: number }[];
  parVille: { label: string; valeur: number }[];
  parAgent: { label: string; valeur: number }[];
  caParProduit: { label: string; valeur: number }[];
};

function formatMontant(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export default function TableauDeBordPage() {
  const [data, setData] = useState<TableauDeBord | null>(null);
  const [gammes, setGammes] = useState<GammeInfo[]>([]);
  const [gammeId, setGammeId] = useState("");

  useEffect(() => {
    fetch("/api/gammes").then((r) => r.json()).then((d) => setGammes(d.gammes || []));
  }, []);

  useEffect(() => {
    const url = gammeId ? `/api/tableau-de-bord?gammeId=${encodeURIComponent(gammeId)}` : "/api/tableau-de-bord";
    fetch(url).then((r) => r.json()).then(setData);
  }, [gammeId]);

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 font-display text-2xl text-ink">
        <IconChart className="h-5 w-5 text-brass" />
        Tableau de bord
      </h1>

      <div className="mb-2">
        <GammeTabs gammes={gammes} value={gammeId} onChange={setGammeId} />
      </div>
      {gammeId && (
        <p className="mb-5 text-xs text-ink-muted">
          La gamme choisie s'applique aux commandes et au chiffre d'affaires ; visites et points de vente restent globaux.
        </p>
      )}
      {!gammeId && <div className="mb-4" />}

      {!data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="field-card h-24 animate-pulse bg-bg-elevated/60" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Activité du jour — les 3 chiffres qui comptent le plus au quotidien,
              mis en avant avant le reste des indicateurs. */}
          <p className="section-eyebrow mb-3">Aujourd'hui</p>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiHero icon={IconReceipt} label="Chiffre d'affaires du jour" valeur={formatMontant(data.caDuJour)} accent="brass" />
            <KpiHero icon={IconReceipt} label="Commandes aujourd'hui" valeur={data.commandesAujourdhui} accent="ok" />
            <KpiHero icon={IconStorefront} label="Visites aujourd'hui" valeur={data.visitesAujourdhui} accent="warn" />
          </div>

          <p className="section-eyebrow mb-3">Vue d'ensemble</p>
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi icon={IconStorefront} label="Points de vente recensés" valeur={data.pointVenteTotal} />
            <Kpi icon={IconReceipt} label="CA total" valeur={formatMontant(data.caTotal)} />
            <Kpi icon={IconCheckCircle} label="Intéressés (visite commerciale)" valeur={data.interessesTotal} />
            <Kpi icon={IconTrend} label="Taux de conversion" valeur={`${data.tauxConversion}%`} />
            <Kpi icon={IconStorefront} label="Visites au total" valeur={data.visitesTotal} />
          </div>

          <p className="section-eyebrow mb-3">Répartitions</p>
          <div className="grid gap-4 md:grid-cols-2">
            <BarreGraphique titre="Potentiel estimé" data={data.parPotentiel} />
            <BarreGraphique titre="Par type d'établissement" data={data.parType} />
            <BarreGraphique titre="Par ville" data={data.parVille} />
            <BarreGraphique titre="Visites par agent" data={data.parAgent} />
            <BarreGraphique titre="Chiffre d'affaires par produit" data={data.caParProduit} formatValeur={formatMontant} />
          </div>
        </>
      )}
    </div>
  );
}

function KpiHero({
  icon: Icon,
  label,
  valeur,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  valeur: string | number;
  accent: "brass" | "ok" | "warn";
}) {
  const classe = { brass: "bg-brass/10 text-brass", ok: "bg-ok/10 text-ok", warn: "bg-warn/10 text-warn" }[accent];
  return (
    <div className="field-card flex items-center gap-4 border-brass/20 bg-gradient-to-br from-bg-card to-bg-elevated">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${classe}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs text-ink-muted">{label}</p>
        <p className="font-display text-3xl text-ink">{valeur}</p>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  valeur,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  valeur: string | number;
}) {
  return (
    <div className="field-card transition-shadow hover:shadow-md">
      <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-brass/10 text-brass">
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="font-display text-2xl text-ink">{valeur}</p>
    </div>
  );
}
