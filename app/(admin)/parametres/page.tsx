"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReferentielManager from "@/components/ReferentielManager";
import PaliersPrixManager from "@/components/PaliersPrixManager";
import DureeSessionManager from "@/components/DureeSessionManager";
import { GRILLE_BELGRAVIA, BOUTEILLES_PAR_CARTON_BELGRAVIA } from "@/lib/tarifs";
import { libelleGamme, type GammeInfo } from "@/lib/gammesClient";
import { IconGear, IconPin, IconStorefront, IconGlass, IconArrowRight, IconUsers, IconReceipt, IconShield } from "@/components/icons";

type Icone = (p: { className?: string }) => JSX.Element;
type Bloc = { id: string; titre: string; contenu: React.ReactNode };
type Section = { id: string; titre: string; description: string; Icone: Icone; couleur: string; blocs: Bloc[] };

function LienCarte({ href, titre, texte, Icone }: { href: string; titre: string; texte: string; Icone: Icone }) {
  return (
    <Link href={href} className="field-card flex items-center justify-between transition-colors hover:border-brass/50">
      <span>
        <span className="section-eyebrow mb-1 flex">
          <Icone className="h-4 w-4" />
          {titre}
        </span>
        <span className="block text-sm text-ink-muted">{texte}</span>
      </span>
      <IconArrowRight className="h-4 w-4 text-ink-muted" />
    </Link>
  );
}

export default function ParametresPage() {
  const [gammes, setGammes] = useState<GammeInfo[]>([]);
  const [actif, setActif] = useState("catalogue");

  useEffect(() => {
    fetch("/api/gammes").then((r) => r.json()).then((d) => setGammes(d.gammes || []));
  }, []);

  const sections: Section[] = [
    {
      id: "catalogue",
      titre: "Catalogue",
      description: "Villes, types d'établissement, marques et produits : ces listes alimentent les menus du formulaire terrain.",
      Icone: IconGlass,
      couleur: "bg-[#0f3d2e]",
      blocs: [
        { id: "villes", titre: "Villes", contenu: <ReferentielManager titre="Villes" icon={IconPin} apiBase="/api/villes" /> },
        { id: "types", titre: "Types d'établissement", contenu: <ReferentielManager titre="Types d'établissement" icon={IconStorefront} apiBase="/api/types-etablissement" /> },
        { id: "mousseux", titre: "Marques — Vins mousseux / Champagnes", contenu: <ReferentielManager titre="Marques — Vins mousseux / Champagnes" icon={IconGlass} apiBase="/api/marques" categorie="MOUSSEUX" /> },
        { id: "rtd", titre: "Marques — Cocktails RTD", contenu: <ReferentielManager titre="Marques — Cocktails RTD" icon={IconGlass} apiBase="/api/marques" categorie="RTD" /> },
        { id: "produits", titre: "Produits", contenu: <LienCarte href="/produits" titre="Produits" texte="Gérer les produits et leurs prix" Icone={IconGlass} /> },
      ],
    },
    {
      id: "equipe",
      titre: "Équipe",
      description: "Comptes, rôles et appareils connectés.",
      Icone: IconUsers,
      couleur: "bg-[#2f5d50]",
      blocs: [
        { id: "sessions", titre: "Sessions actives", contenu: <LienCarte href="/utilisateurs" titre="Sessions actives" texte="Voir et déconnecter les appareils connectés, par utilisateur (onglet Utilisateurs)" Icone={IconUsers} /> },
      ],
    },
    {
      id: "tarifs",
      titre: "Tarif bureau",
      description: "Barème de prix par volume de commande, pour chaque gamme.",
      Icone: IconReceipt,
      couleur: "bg-[#8a6a1f]",
      blocs: gammes.map((g) => ({
        id: g.id,
        titre: `Barème ${libelleGamme(g)}`,
        contenu: (
          <PaliersPrixManager
            gammeId={g.id}
            libelle={libelleGamme(g)}
            {...(g.code === "BELGRAVIA" ? { bouteillesParCarton: BOUTEILLES_PAR_CARTON_BELGRAVIA, grilleOfficielle: GRILLE_BELGRAVIA } : {})}
          />
        ),
      })),
    },
    {
      id: "securite",
      titre: "Sécurité",
      description: "Durée d'inactivité avant déconnexion automatique.",
      Icone: IconShield,
      couleur: "bg-[#7a2e2a]",
      blocs: [{ id: "session", titre: "Durée de session", contenu: <DureeSessionManager /> }],
    },
  ];

  const courante = sections.find((s) => s.id === actif) || sections[0];

  return (
    <div className="max-w-6xl">
      <h1 className="mb-1 flex items-center gap-2 font-display text-2xl text-ink">
        <IconGear className="h-5 w-5 text-brass" />
        Paramètres
      </h1>
      <p className="mb-5 text-sm text-ink-muted">
        Rien n'est codé en dur : ajoute, renomme, désactive ou supprime librement — désactiver garde l'historique intact, supprimer n'est possible que si l'élément n'est utilisé nulle part.
      </p>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <nav aria-label="Sections des paramètres" className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:self-start">
          {sections.map((s) => {
            const on = s.id === courante.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActif(s.id)}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${on ? "border-brass bg-brass/10 shadow-sm" : "border-line bg-bg-card hover:border-brass/50"}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white ${s.couleur}`}>
                  <s.Icone className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-menu text-sm font-extrabold text-ink">{s.titre}</span>
                  <span className="hidden text-xs text-ink-muted sm:line-clamp-2 sm:block">{s.description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-bg-card">
          <header className={`flex items-center gap-3 px-5 py-4 text-white ${courante.couleur}`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
              <courante.Icone className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-xl leading-tight">{courante.titre}</h2>
              <p className="text-xs text-white/80">{courante.description}</p>
            </div>
          </header>
          <div className="space-y-2 p-3 sm:p-4">
            {courante.blocs.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">Rien à configurer ici pour l'instant.</p>}
            {courante.blocs.map((b, i) => (
              <details key={courante.id + b.id} open={i === 0 || courante.blocs.length <= 2} className="group rounded-xl border border-line bg-bg-elevated/40">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-bold text-ink">
                  {b.titre}
                  <IconArrowRight className="h-4 w-4 text-ink-muted transition-transform group-open:rotate-90" />
                </summary>
                <div className="grid p-2 sm:p-3 [&>.field-card]:shadow-none">{b.contenu}</div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
