import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { peut, estBackOffice, moduleDePage, accueilPourRole, LIBELLE_ROLE, type RoleApp } from "@/lib/permissions";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import InstallButton from "@/components/InstallButton";
import GoldRule from "@/components/GoldRule";
import LogoSiri from "@/components/LogoSiri";
import MenuLateral from "@/components/MenuLateral";
import InactivityLogout from "@/components/InactivityLogout";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !estBackOffice(session.role)) redirect("/login");

  // Contrôle d'accès par module, avec le rôle lu en base (le middleware ne voit que le cookie).
  const chemin = headers().get("x-pathname") ?? "";
  const module = moduleDePage(chemin);
  if (module && !peut(session.role, module)) redirect(accueilPourRole(session.role));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <InactivityLogout />
      <aside className="no-print relative border-b border-line bg-bg-elevated px-5 py-5 lg:sticky lg:top-0 lg:h-screen lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <LogoSiri hauteur={44} plaque />
        <p className="mt-3 font-display text-2xl italic leading-none text-ink">Belgravia / VDV</p>
        <p className="mt-1 font-menu text-[11px] font-bold uppercase tracking-[0.2em] text-brass">
          {session.role === "SUPERVISEUR" ? "Supervision" : "Administration"}
        </p>
        <GoldRule className="mt-4 hidden lg:flex" />
        <MenuLateral role={session.role} />
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
