"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import ChampagneScene from "@/components/ChampagneScene";
import GoldRule from "@/components/GoldRule";
import InstallButton from "@/components/InstallButton";
import { IconUser, IconLock } from "@/components/icons";

// useSearchParams() (lecture de ?motif=inactivite, voir InactivityLogout)
// oblige Next.js à isoler le composant qui l'utilise dans un <Suspense> —
// sans ça, le build échoue au prerendering de /login.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(
    searchParams.get("motif") === "inactivite" ? "Session déconnectée après une période d'inactivité." : null
  );
  const [enCours, setEnCours] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiant, motDePasse }),
    });
    setEnCours(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error || "Identifiants incorrects.");
      return;
    }
    const { role } = await res.json();
    router.push(role === "ADMIN" ? "/tableau-de-bord" : "/terrain");
    router.refresh();
  }

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[1.12fr_1fr]">
      {/* Volet de marque — minuit bordeaux + or champagne, indépendant du mode
          clair/sombre choisi par la personne. */}
      <aside className="relative hidden overflow-hidden bg-[#14070F] text-[#F4EBDD] lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:px-16 lg:py-14">
        {/* Lumières : bordeaux derrière les verres, champagne en coin */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 45% at 50% 38%, rgba(122,32,62,0.55) 0%, transparent 70%), radial-gradient(40% 30% at 0% 0%, rgba(230,204,154,0.14) 0%, transparent 70%), radial-gradient(50% 40% at 100% 100%, rgba(90,27,53,0.5) 0%, transparent 70%)",
          }}
        />
        {/* Grain fin, esprit étiquette papier */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
        />
        {/* Filet d'étiquette */}
        <div aria-hidden className="pointer-events-none absolute inset-5 rounded-sm border border-[#E6CC9A]/20" />

        <header className="relative">
          <p className="font-display text-3xl italic leading-none text-[#F7EBD0]">Belgravia / VDV</p>
          <p className="mt-2 text-xs tracking-[0.22em] text-[#E6CC9A]/80">by ICHA IMPORT</p>
        </header>

        <div className="relative my-6 min-h-[240px] flex-1">
          <ChampagneScene className="absolute inset-0 h-full w-full" />
        </div>

        <div className="relative">
          <h2 className="bg-gradient-to-b from-[#FBF1D8] via-[#E6CC9A] to-[#B8893F] bg-clip-text font-display text-[clamp(3.2rem,4.8vw,5.2rem)] italic leading-[0.98] tracking-[-0.01em] text-transparent">
            Le terrain,
            <br />
            servi frais.
          </h2>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[#F4EBDD]/70">
            Recensez les points de vente, prenez les commandes et suivez vos tournées — Belgravia et Veuve du Vernay, au même endroit.
          </p>

          <dl className="mt-8 grid max-w-md grid-cols-2 gap-6 border-t border-[#E6CC9A]/25 pt-5">
            <div>
              <dt className="font-display text-xl text-[#F7EBD0]">Belgravia</dt>
              <dd className="mt-1 text-sm text-[#F4EBDD]/60">Cocktails au gin prêts à boire</dd>
            </div>
            <div>
              <dt className="font-display text-xl text-[#F7EBD0]">Veuve du Vernay</dt>
              <dd className="mt-1 text-sm text-[#F4EBDD]/60">Vins mousseux, cinq saveurs</dd>
            </div>
          </dl>

          <p className="mt-10 text-xs text-[#F4EBDD]/40">
            © {new Date().getFullYear()} BELGRAVIA / VDV by ICHA IMPORT — usage interne
          </p>
        </div>
      </aside>

      {/* Volet formulaire */}
      <section className="relative flex min-h-screen flex-col bg-[radial-gradient(circle_at_100%_0%,rgb(var(--color-brass)/0.12),transparent_45%)]">
        <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
          <InstallButton />
          <ThemeToggle />
        </div>

        {/* En-tête mobile : même univers que le volet de marque */}
        <div className="relative overflow-hidden rounded-b-[2rem] bg-[#14070F] px-6 pb-12 pt-10 text-center lg:hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(70% 70% at 50% 40%, rgba(122,32,62,0.55) 0%, transparent 70%)" }}
          />
          <div className="relative">
            <ChampagneScene className="mx-auto h-40 w-auto" />
            <p className="mt-4 font-display text-4xl italic leading-none text-[#F7EBD0]">Belgravia / VDV</p>
            <p className="mt-2 text-xs tracking-[0.22em] text-[#E6CC9A]/80">by ICHA IMPORT</p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 max-lg:-mt-6 max-lg:items-start">
          <div className="w-full max-w-sm">
            <div className="mb-8 hidden text-center lg:block">
              <h1 className="font-display text-5xl italic text-ink">Bon retour</h1>
              <p className="mt-3 text-sm text-ink-muted">Connectez-vous pour accéder à vos visites, commandes et rapports.</p>
              <GoldRule className="mx-auto mt-5 max-w-[140px]" />
            </div>

          <form onSubmit={handleSubmit} className="relative space-y-5 overflow-hidden rounded-2xl border border-line bg-bg-card p-7 shadow-[0_40px_70px_-40px_rgb(70_20_35/0.45)]">
            <div>
              <label className="field-label" htmlFor="identifiant">
                Identifiant
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-ink-muted">
                  <IconUser className="h-4 w-4" />
                </span>
                <input
                  id="identifiant"
                  className="field-input pl-11"
                  autoComplete="username"
                  value={identifiant}
                  onChange={(e) => setIdentifiant(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="motDePasse">
                Mot de passe / code personnel
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-ink-muted">
                  <IconLock className="h-4 w-4" />
                </span>
                <input
                  id="motDePasse"
                  type={motDePasseVisible ? "text" : "password"}
                  className="field-input pl-11 pr-11"
                  autoComplete="current-password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setMotDePasseVisible((v) => !v)}
                  aria-label={motDePasseVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-muted hover:text-brass"
                >
                  {motDePasseVisible ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M3 3l18 18" />
                      <path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c5 0 9 4.5 10 7-0.4 1-1.2 2.3-2.4 3.5M6.6 6.6C4.5 8 3 10 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.4 4.4-1.1" />
                      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7s-9-4.5-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {erreur && (
              <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {erreur}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary w-full !bg-gradient-to-b !from-[#E6CC9A] !to-[#B8893F] !py-3.5 !text-[#2A1020] shadow-[0_10px_24px_-10px_rgb(184_137_63/0.9)]"
              disabled={enCours}
            >
              {enCours ? "Connexion…" : "Se connecter"}
            </button>
            <span aria-hidden className="absolute inset-x-8 top-0 !m-0 h-px bg-gradient-to-r from-transparent via-[#D9B45E] to-transparent" />
          </form>

            <p className="mt-6 text-center text-xs text-ink-muted">Accès réservé à l&apos;équipe ICHA IMPORT.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
