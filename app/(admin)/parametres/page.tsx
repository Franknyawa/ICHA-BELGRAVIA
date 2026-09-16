"use client";

import Link from "next/link";
import ReferentielManager from "@/components/ReferentielManager";
import { IconGear, IconPin, IconStorefront, IconGlass, IconArrowRight } from "@/components/icons";

export default function ParametresPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="mb-5 flex items-center gap-2 font-display text-2xl text-ink">
        <IconGear className="h-5 w-5 text-brass" />
        Paramètres
      </h1>

      <p className="mb-5 text-sm text-ink-muted">
        Ces listes alimentent les menus déroulants du formulaire terrain. Rien n'est codé en
        dur : ajoute, renomme, désactive ou supprime librement — désactiver garde l'historique
        intact, supprimer n'est possible que si l'élément n'est utilisé nulle part.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <ReferentielManager titre="Villes" icon={IconPin} apiBase="/api/villes" />
        <ReferentielManager titre="Types d'établissement" icon={IconStorefront} apiBase="/api/types-etablissement" />
        <ReferentielManager titre="Marques" icon={IconGlass} apiBase="/api/marques" />

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
      </div>
    </div>
  );
}
