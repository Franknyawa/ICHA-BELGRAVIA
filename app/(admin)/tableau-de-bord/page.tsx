"use client";

import { useEffect, useState } from "react";
import BarreGraphique from "@/components/BarreGraphique";
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

  useEffect(() => {
    fetch("/api/tableau-de-bord").then((r) => r.json()).then(setData);
  }, []);

  return (
    <div>
      <h1 className="mb-5 flex items-center gap-2 font-display text-2xl text-ink">
        <IconChart className="h-5 w-5 text-brass" />
        Tableau de bord
      </h1>

      {data && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi icon={IconStorefront} label="Visites aujourd'hui" valeur={data.visitesAujourdhui} />
          <Kpi icon={IconStorefront} label="Points de vente recensés" valeur={data.pointVenteTotal} />
          <Kpi icon={IconReceipt} label="Commandes aujourd'hui" valeur={data.commandesAujourdhui} />
          <Kpi icon={IconReceipt} label="CA du jour" valeur={formatMontant(data.caDuJour)} />
          <Kpi icon={IconReceipt} label="CA total" valeur={formatMontant(data.caTotal)} />
          <Kpi icon={IconCheckCircle} label="Intéressés (visite commerciale)" valeur={data.interessesTotal} />
          <Kpi icon={IconTrend} label="Taux de conversion" valeur={`${data.tauxConversion}%`} />
          <Kpi icon={IconStorefront} label="Visites au total" valeur={data.visitesTotal} />
        </div>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <BarreGraphique titre="Potentiel estimé" data={data.parPotentiel} />
          <BarreGraphique titre="Par type d'établissement" data={data.parType} />
          <BarreGraphique titre="Par ville" data={data.parVille} />
          <BarreGraphique titre="Visites par agent" data={data.parAgent} />
          <BarreGraphique titre="Chiffre d'affaires par produit" data={data.caParProduit} formatValeur={formatMontant} />
        </div>
      )}
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
    <div className="field-card">
      <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-brass/10 text-brass">
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="font-display text-2xl text-ink">{valeur}</p>
    </div>
  );
}
