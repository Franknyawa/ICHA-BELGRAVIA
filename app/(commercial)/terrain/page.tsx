"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  IconPlus,
  IconStorefront,
  IconAlert,
  IconCheckCircle,
  IconClipboard,
  IconClock,
} from "@/components/icons";

type VisiteJour = {
  id: string;
  createdAt: string;
  pointVente: { nomEtablissement: string; quartier: string | null };
};

type ItemSuivi = {
  id: string;
  createdAt: string;
  pointVente: { nomEtablissement: string; quartier: string | null };
};

type TableauDeBord = {
  stats: { jour: number; semaine: number; mois: number };
  interesses: { total: number; items: ItemSuivi[] };
  commandes: { total: number; items: ItemSuivi[] };
};

export default function TerrainHome() {
  const [visites, setVisites] = useState<VisiteJour[] | null>(null);
  const [tdb, setTdb] = useState<TableauDeBord | null>(null);

  useEffect(() => {
    fetch("/api/visites/mine")
      .then((r) => r.json())
      .then((data) => setVisites(data.visites || []));
    fetch("/api/visites/tableau-de-bord")
      .then((r) => r.json())
      .then(setTdb);
  }, []);

  const nbAlertes = (tdb?.interesses.total || 0) + (tdb?.commandes.total || 0);
  const maxStat = tdb ? Math.max(1, tdb.stats.jour, tdb.stats.semaine, tdb.stats.mois) : 1;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <Link href="/terrain/nouvelle-visite" className="btn-primary flex w-full py-4 text-base">
        <IconPlus className="h-4 w-4" />
        Nouvelle visite
      </Link>

      {/* Mes performances */}
      <section className="field-card">
        <p className="section-eyebrow mb-3">
          <IconClock className="h-4 w-4" />
          Mes performances
        </p>
        <div className="space-y-2.5">
          <StatLigne label="Aujourd'hui" valeur={tdb?.stats.jour} max={maxStat} />
          <StatLigne label="Cette semaine" valeur={tdb?.stats.semaine} max={maxStat} />
          <StatLigne label="Ce mois" valeur={tdb?.stats.mois} max={maxStat} />
        </div>
      </section>

      {/* Alertes de suivi */}
      {nbAlertes > 0 && (
        <section className="field-card">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-warn">
            <IconAlert className="h-4 w-4" />
            {nbAlertes} point{nbAlertes > 1 ? "s" : ""} à suivre
          </p>

          {tdb!.commandes.total > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink">
                <IconClipboard className="h-3.5 w-3.5 text-brass" />
                {tdb!.commandes.total} veut{tdb!.commandes.total > 1 ? "ent" : ""} commander
              </div>
              <div className="space-y-1.5">
                {tdb!.commandes.items.map((it) => (
                  <SuiviLigne key={it.id} item={it} />
                ))}
                {tdb!.commandes.total > tdb!.commandes.items.length && (
                  <p className="text-center text-xs text-ink-muted">
                    + {tdb!.commandes.total - tdb!.commandes.items.length} autre(s)
                  </p>
                )}
              </div>
            </div>
          )}

          {tdb!.interesses.total > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink">
                <IconCheckCircle className="h-3.5 w-3.5 text-brass" />
                {tdb!.interesses.total} intéressé{tdb!.interesses.total > 1 ? "s" : ""} par une visite commerciale
              </div>
              <div className="space-y-1.5">
                {tdb!.interesses.items.map((it) => (
                  <SuiviLigne key={it.id} item={it} />
                ))}
                {tdb!.interesses.total > tdb!.interesses.items.length && (
                  <p className="text-center text-xs text-ink-muted">
                    + {tdb!.interesses.total - tdb!.interesses.items.length} autre(s)
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Visites du jour */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">
          Visites du jour {visites ? `(${visites.length})` : ""}
        </h2>

        {visites === null && <p className="text-sm text-ink-muted">Chargement…</p>}
        {visites?.length === 0 && (
          <p className="field-card text-sm text-ink-muted">Aucune visite enregistrée aujourd'hui.</p>
        )}

        <ul className="space-y-2">
          {visites?.map((v) => (
            <li key={v.id} className="field-card flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
                <IconStorefront className="h-4 w-4" />
              </span>
              <div>
                <p className="font-medium text-ink">{v.pointVente.nomEtablissement}</p>
                <p className="text-sm text-ink-muted">
                  {v.pointVente.quartier || "Quartier non précisé"} ·{" "}
                  {new Date(v.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatLigne({ label, valeur, max }: { label: string; valeur: number | undefined; max: number }) {
  const v = valeur ?? 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-ink-muted">{label}</span>
        <span className="font-semibold text-ink">{valeur === undefined ? "—" : v}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-bg-elevated">
        <div className="h-1.5 rounded-full bg-brass transition-all" style={{ width: `${(v / max) * 100}%` }} />
      </div>
    </div>
  );
}

function SuiviLigne({ item }: { item: ItemSuivi }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-bg-elevated px-3 py-2 text-sm">
      <span className="font-medium text-ink">{item.pointVente.nomEtablissement}</span>
      <span className="text-xs text-ink-muted">
        {new Date(item.createdAt).toLocaleDateString("fr-FR")}
      </span>
    </div>
  );
}
