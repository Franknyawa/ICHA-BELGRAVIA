"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconStorefront, IconClock } from "@/components/icons";

type Visite = {
  id: string;
  createdAt: string;
  potentielEstime: string | null;
  veutCommander: boolean | null;
  pointVente: { nomEtablissement: string; quartier: string | null };
};

function libelleJour(date: Date): string {
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const hier = new Date(aujourdhui);
  hier.setDate(hier.getDate() - 1);
  const jour = new Date(date);
  jour.setHours(0, 0, 0, 0);

  if (jour.getTime() === aujourdhui.getTime()) return "Aujourd'hui";
  if (jour.getTime() === hier.getTime()) return "Hier";
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
}

export default function HistoriqueVisitesPage() {
  const [visites, setVisites] = useState<Visite[] | null>(null);

  useEffect(() => {
    fetch("/api/visites/mine?jours=7")
      .then((r) => r.json())
      .then((d) => setVisites(d.visites || []));
  }, []);

  const groupes = new Map<string, Visite[]>();
  for (const v of visites || []) {
    const label = libelleJour(new Date(v.createdAt));
    if (!groupes.has(label)) groupes.set(label, []);
    groupes.get(label)!.push(v);
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <Link href="/terrain" className="text-sm text-ink-muted hover:text-brass">
        ← Retour
      </Link>
      <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
        <IconClock className="h-5 w-5 text-brass" />
        Historique — 7 derniers jours
      </h1>

      {visites === null && <p className="text-sm text-ink-muted">Chargement…</p>}
      {visites !== null && visites.length === 0 && (
        <p className="field-card text-sm text-ink-muted">Aucune visite sur les 7 derniers jours.</p>
      )}

      {[...groupes.entries()].map(([label, items]) => (
        <section key={label}>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-ink-muted">
            {label} ({items.length})
          </h2>
          <ul className="space-y-2">
            {items.map((v) => (
              <li key={v.id} className="field-card flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
                  <IconStorefront className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium text-ink">{v.pointVente.nomEtablissement}</p>
                  <p className="text-sm text-ink-muted">
                    {v.pointVente.quartier || "Quartier non précisé"} ·{" "}
                    {new Date(v.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    {v.veutCommander ? " · Veut commander" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
