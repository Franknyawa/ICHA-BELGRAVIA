import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import SyncBanner from "@/components/SyncBanner";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import ThemeToggle from "@/components/ThemeToggle";

export default async function CommercialLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") redirect("/login");

  return (
    <div className="min-h-screen">
      <RegisterServiceWorker />
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div>
          <p className="font-display italic text-lg leading-none text-ink">Belgravia</p>
          <p className="text-xs text-ink-muted">
            {session.prenom} {session.nom}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <main className="px-4 pb-10 pt-4">
        <SyncBanner />
        {children}
      </main>
    </div>
  );
}
