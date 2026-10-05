"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReferentielManager from "@/components/ReferentielManager";
import PaliersPrixManager from "@/components/PaliersPrixManager";
import DureeSessionManager from "@/components/DureeSessionManager";
import { libelleGamme, type GammeInfo } from "@/lib/gammesClient";
import { IconGear, IconPin, IconStorefront, IconGlass, IconArrowRight, IconUsers } from "@/components/icons";

export default function ParametresPage() {
  const [gammes, setGammes] = useState<GammeInfo[]>([]);

  useEffect(() => {
    fetch("/api/gammes").then((r) => r.json()).then((d) => setGammes(d.gammes || []));
  }, []);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-5 flex items-center gap-2 font-display text-2xl text-ink">
        <IconGear className="h-5 w-5 text-brass" />
        Paramètres
      </h1>

      <p className="mb-5 text-sm text-ink-muted">
        Ces listes alimentent les menus déroulants du formulaire terrain, y compris les marques de boissons
        relevées à la section « Offre et potentiel ». Rien n'est codé en
        dur : ajoute, renomme, désactive ou supprime librement — désactiver garde l'historique
        intact, supprimer n'est possible que si l'élément n'est utilisé nulle part.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <DureeSessionManager />

        <Link href="/utilisateurs" className="field-card flex items-center justify-between transition-colors hover:border-brass/50">
          <span>
            <span className="section-eyebrow mb-1 flex">
              <IconUsers className="h-4 w-4" />
              Sessions actives
            </span>
            <span className="block text-sm text-ink-muted">
              Voir et déconnecter les appareils connectés, par utilisateur (onglet Utilisateurs)
            </span>
          </span>
          <IconArrowRight className="h-4 w-4 text-ink-muted" />
        </Link>

        <ReferentielManager titre="Villes" icon={IconPin} apiBase="/api/villes" />
        <ReferentielManager titre="Types d'établissement" icon={IconStorefront} apiBase="/api/types-etablissement" />
        <ReferentielManager
          titre="Marques — Vins mousseux / Champagnes"
          icon={IconGlass}
          apiBase="/api/marques"
          categorie="MOUSSEUX"
        />
        <ReferentielManager titre="Marques — Cocktails RTD" icon={IconGlass} apiBase="/api/marques" categorie="RTD" />

        <Link href="/produits" className="field-card flex items-center justify-between transition-colors hover:border-brass/50">
          <span>
            <span className="section-eyebrow mb-1 flex">
              <IconGlass className="h-4 w-4" />
              Produits
            </span>
            <span className="block text-sm text-ink-muted">Gérer les produits et leurs prix</span>
          </span>
          <IconArrowRight className="h-4 w-4 text-ink-muted" />
        </Link>

        {gammes.map((g) => (
          <PaliersPrixManager key={g.id} gammeId={g.id} libelle={libelleGamme(g)} />
        ))}
      </div>
    </div>
  );
}
