"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { peut, type Module } from "@/lib/permissions";
import BadgeCompteur from "@/components/BadgeCompteur";
import {
  IconStorefront,
  IconChart,
  IconUsers,
  IconReceipt,
  IconGlass,
  IconMap,
  IconGear,
  IconPin,
  IconDownload,
  IconTrend,
  IconList,
  IconAlert,
  IconWallet,
  IconArchive,
  IconRoute,
} from "@/components/icons";

type Lien = {
  href: string;
  libelle: string;
  module: Module;
  Icone: (p: { className?: string }) => JSX.Element;
  badge?: string; // URL renvoyant { count }
};

const SECTIONS: { titre: string; liens: Lien[] }[] = [
  {
    titre: "Pilotage",
    liens: [
      { href: "/tableau-de-bord", libelle: "Tableau de bord", module: "tableau_de_bord", Icone: IconChart },
      { href: "/alertes", libelle: "Alertes", module: "alertes", Icone: IconAlert, badge: "/api/alertes/count" },
      { href: "/rapports", libelle: "Rapports", module: "rapports", Icone: IconTrend },
    ],
  },
  {
    titre: "Ventes",
    liens: [
      { href: "/commandes", libelle: "Commandes", module: "commandes", Icone: IconReceipt, badge: "/api/commandes/count" },
      { href: "/factures", libelle: "Factures", module: "commandes", Icone: IconDownload },
    ],
  },
  {
    titre: "Terrain",
    liens: [
      { href: "/dashboard", libelle: "Visites terrain", module: "visites", Icone: IconRoute },
      { href: "/points-de-vente", libelle: "Points de vente", module: "points_de_vente", Icone: IconStorefront },
      { href: "/statistiques", libelle: "Carte", module: "carte", Icone: IconMap },
      { href: "/tracking", libelle: "Tracking", module: "tracking", Icone: IconPin },
    ],
  },
  {
    titre: "Stock et finances",
    liens: [
      { href: "/stock", libelle: "Stock", module: "stock", Icone: IconList },
      { href: "/caisse", libelle: "Caisse", module: "caisse", Icone: IconWallet },
      { href: "/produits", libelle: "Produits", module: "produits", Icone: IconGlass },
    ],
  },
  {
    titre: "Administration",
    liens: [
      { href: "/utilisateurs", libelle: "Utilisateurs", module: "utilisateurs", Icone: IconUsers },
      { href: "/parametres", libelle: "Paramètres", module: "parametres", Icone: IconGear },
      { href: "/archives", libelle: "Archives", module: "archives", Icone: IconArchive },
    ],
  },
];

function actif(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Menu du back-office : sections, lien actif, pastilles, filtré selon le rôle. Repliable sur mobile. */
export default function MenuLateral({ role }: { role: string }) {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);

  // Referme le menu mobile après chaque navigation.
  useEffect(() => setOuvert(false), [pathname]);

  const sections = SECTIONS.map((s) => ({ ...s, liens: s.liens.filter((l) => peut(role, l.module)) })).filter(
    (s) => s.liens.length > 0
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-controls="menu-lateral"
        className="absolute right-4 top-4 flex h-10 items-center gap-2 rounded-md border border-line px-3 font-menu text-sm font-bold text-ink lg:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {ouvert ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        Menu
      </button>

      <nav id="menu-lateral" className={`${ouvert ? "block" : "hidden"} mt-5 font-menu lg:mt-6 lg:block`} aria-label="Navigation principale">
        {sections.map((section) => (
          <div key={section.titre} className="mb-5">
            <p className="mb-1.5 px-2.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-ink">{section.titre}</p>
            <ul className="space-y-0.5">
              {section.liens.map((l) => {
                const estActif = actif(pathname, l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={estActif ? "page" : undefined}
                      className={[
                        "flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[15px] font-semibold transition-colors",
                        estActif
                          ? "bg-brass text-bg shadow-[0_4px_14px_-6px_rgb(var(--color-brass)/0.7)]"
                          : "text-ink-muted hover:bg-brass/10 hover:text-brass",
                      ].join(" ")}
                    >
                      <l.Icone className="h-[18px] w-[18px] shrink-0" />
                      <span>{l.libelle}</span>
                      {l.badge && <BadgeCompteur url={l.badge} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
