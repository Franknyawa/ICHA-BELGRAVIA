"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconPlus, IconStorefront } from "@/components/icons";

type VisiteJour = {
  id: string;
  createdAt: string;
  pointVente: { nomEtablissement: string; quartier: string | null };
};

export default function TerrainHome() {
  const [visites, setVisites] = useState<VisiteJour[] | null>(null);

  useEffect(() => {
    fetch("/api/visites/mine")
      .then((r) => r.json())
      .then((data) => setVisites(data.visites || []));
  }, []);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Link
        href="/terrain/nouvelle-visite"
        className="btn-primary flex w-full py-4 text-base"
      >
        <IconPlus className="h-4 w-4" />
        Nouvelle visite
      </Link>

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
