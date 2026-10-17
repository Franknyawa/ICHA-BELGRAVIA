import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { peut, estBackOffice, moduleDePage, accueilPourRole, LIBELLE_ROLE, type Module, type RoleApp } from "@/lib/permissions";
import { SIGNATURE_APP } from "@/lib/marque";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import InstallButton from "@/components/InstallButton";
import GoldRule from "@/components/GoldRule";
import AlertesBadge from "@/components/AlertesBadge";
import InactivityLogout from "@/components/InactivityLogout";
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
} from "@/components/icons";

const LIENS: { href: string; libelle: string; module: Module; Icone: (p: { className?: string }) => JSX.Element }[] = [
  { href: "/tableau-de-bord", libelle: "Tableau de bord", module: "tableau_de_bord", Icone: IconChart },
  { href: "/dashboard", libelle: "Visites terrain", module: "visites", Icone: IconStorefront },
  { href: "/alertes", libelle: "Alertes", module: "alertes", Icone: IconAlert },
  { href: "/commandes", libelle: "Commandes", module: "commandes", Icone: IconReceipt },
  { href: "/factures", libelle: "Factures", module: "commandes", Icone: IconDownload },
  { href: "/points-de-vente", libelle: "Points de vente", module: "points_de_vente", Icone: IconStorefront },
  { href: "/rapports", libelle: "Rapports", module: "rapports", Icone: IconTrend },
  { href: "/statistiques", libelle: "Carte", module: "carte", Icone: IconMap },
  { href: "/tracking", libelle: "Tracking", module: "tracking", Icone: IconPin },
  { href: "/stock", libelle: "Stock", module: "stock", Icone: IconList },
  { href: "/caisse", libelle: "Caisse", module: "caisse", Icone: IconWallet },
  { href: "/archives", libelle: "Archives", module: "archives", Icone: IconArchive },
  { href: "/utilisateurs", libelle: "Utilisateurs", module: "utilisateurs", Icone: IconUsers },
  { href: "/produits", libelle: "Produits", module: "produits", Icone: IconGlass },
  { href: "/parametres", libelle: "Paramètres", module: "parametres", Icone: IconGear },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !estBackOffice(session.role)) redirect("/login");

  // Contrôle d'accès par module, avec le rôle lu en base (le middleware ne voit que le cookie).
  const chemin = headers().get("x-pathname") ?? "";
  const module = moduleDePage(chemin);
  if (module && !peut(session.role, module)) redirect(accueilPourRole(session.role));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
      <InactivityLogout />
      <aside className="no-print border-b border-line bg-bg-elevated px-5 py-5 lg:min-h-screen lg:border-b-0 lg:border-r">
        <p className="font-display italic text-2xl text-ink">Belgravia / VDV</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brass">{SIGNATURE_APP}</p>
        <p className="mb-4 mt-1 text-xs text-ink-muted">Espace administration</p>
        <GoldRule className="mb-5 hidden lg:flex" />
        <nav className="flex flex-wrap gap-2 text-sm lg:flex-col">
          {LIENS.filter((l) => peut(session.role, l.module)).map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-ink transition-colors hover:bg-brass/10 hover:text-brass">
              <l.Icone className="h-4 w-4" />
              {l.libelle}
              {l.module === "alertes" && <AlertesBadge />}
            </Link>
          ))}
        </nav>
      </aside>
      <div>
        <header className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-6">
          <span className="text-sm text-ink-muted">
            {session.prenom} {session.nom} · {LIBELLE_ROLE[session.role as RoleApp]}
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <InstallButton />
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
