"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import CoupeIllustration from "@/components/CoupeIllustration";
import GoldRule from "@/components/GoldRule";
import { IconUser, IconLock } from "@/components/icons";

export default function LoginPage() {
  const router = useRouter();
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
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
    router.push(role === "ADMIN" ? "/dashboard" : "/terrain");
    router.refresh();
  }

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Volet de marque — vert émeraude profond + or, indépendant du mode
          clair/sombre choisi par la personne. */}
      <div className="relative hidden overflow-hidden bg-[#0F3D2E] px-14 py-14 text-[#F5EFDF] lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #D4AF6A 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, #D4AF6A 0%, transparent 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <span className="h-px w-8 bg-[#D4AF6A]" />
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-[#D4AF6A]">
            Belgravia
          </span>
        </div>

        <div className="relative flex flex-col items-start gap-8">
          <CoupeIllustration className="h-44 w-44 text-[#D4AF6A]" />
          <p className="font-display text-6xl italic leading-[1.05] text-[#F5EFDF]">
            Le terrain,
            <br />
            servi frais.
          </p>
          <p className="max-w-xs text-sm leading-relaxed text-[#F5EFDF]/70">
            Recensement des points de vente et qualification commerciale pour
            le déploiement BELGRAVIA.
          </p>
        </div>

        <p className="relative text-xs text-[#F5EFDF]/50">
          © {new Date().getFullYear()} Belgravia — usage interne
        </p>
      </div>

      {/* Volet formulaire */}
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-10 text-center lg:hidden">
            <p className="font-display text-5xl italic text-ink">Belgravia</p>
            <p className="mt-2 text-sm text-ink-muted">Recensement &amp; qualification terrain</p>
            <GoldRule className="mx-auto mt-4 max-w-[140px]" />
          </div>

          <div className="mb-8 hidden text-center lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ink-muted">
              Espace connecté
            </p>
            <h1 className="mt-2 font-display text-4xl italic text-ink">Bon retour</h1>
            <GoldRule className="mx-auto mt-4 max-w-[140px]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line border-t-2 border-t-brass bg-bg-card p-6 shadow-sm">
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

            {erreur && <p className="text-sm text-danger">{erreur}</p>}

            <button type="submit" className="btn-primary w-full" disabled={enCours}>
              {enCours ? "Connexion…" : "Se connecter"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-muted lg:hidden">
            Recensement des points de vente et qualification commerciale.
          </p>
        </div>
      </div>
    </main>
  );
}
