import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import InstallButton from "@/components/InstallButton";
import GoldRule from "@/components/GoldRule";
import { IconStorefront, IconChart, IconUsers } from "@/components/icons";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="border-b border-line bg-bg-elevated px-5 py-5 lg:min-h-screen lg:border-b-0 lg:border-r">
        <p className="font-display italic text-2xl text-ink">Belgravia</p>
        <p className="mb-4 text-xs text-ink-muted">Espace administration</p>
        <GoldRule className="mb-5 hidden lg:flex" />
        <nav className="flex flex-wrap gap-2 text-sm lg:flex-col">
          <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-ink transition-colors hover:bg-brass/10 hover:text-brass">
            <IconStorefront className="h-4 w-4" />
            Visites terrain
          </Link>
          <Link href="/statistiques" className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-ink transition-colors hover:bg-brass/10 hover:text-brass">
            <IconChart className="h-4 w-4" />
            Statistiques &amp; carte
          </Link>
          <Link href="/utilisateurs" className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-ink transition-colors hover:bg-brass/10 hover:text-brass">
            <IconUsers className="h-4 w-4" />
            Commerciaux
          </Link>
        </nav>
      </aside>
      <div>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-6">
          <span className="text-sm text-ink-muted">
            {session.prenom} {session.nom}
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
