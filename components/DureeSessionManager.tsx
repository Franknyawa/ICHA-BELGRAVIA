"use client";

import { useEffect, useState } from "react";
import { IconClock } from "@/components/icons";

const PRESETS = [10, 15, 30, 60, 120];

/** Réglage de la durée d'inactivité avant déconnexion automatique — voir
 *  components/InactivityLogout.tsx et lib/auth.ts. */
export default function DureeSessionManager() {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [saisie, setSaisie] = useState("");
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/parametres/session-duree")
      .then((r) => r.json())
      .then((d) => {
        setMinutes(d.minutes);
        setSaisie(String(d.minutes));
      })
      .finally(() => setChargement(false));
  }, []);

  async function enregistrer(valeur: number) {
    setEnregistrement(true);
    setErreur(null);
    setMessage(null);
    const res = await fetch("/api/parametres/session-duree", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: valeur }),
    });
    setEnregistrement(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error || "Échec de l'enregistrement.");
      return;
    }
    setMinutes(valeur);
    setSaisie(String(valeur));
    setMessage("Enregistré — s'applique à la prochaine activité de chaque utilisateur.");
  }

  return (
    <div className="field-card">
      <p className="section-eyebrow mb-1">
        <IconClock className="h-4 w-4" />
        Déconnexion automatique
      </p>
      <p className="mb-3 text-sm text-ink-muted">
        Après cette durée d'inactivité (aucun clic, aucune touche, aucun geste), un utilisateur
        — admin ou commercial — est déconnecté automatiquement.
      </p>

      {chargement ? (
        <p className="text-sm text-ink-muted">Chargement…</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => enregistrer(p)}
                disabled={enregistrement}
                className={["choice-pill", minutes === p ? "choice-pill-active" : ""].join(" ")}
              >
                {p < 60 ? `${p} min` : `${p / 60} h`}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="field-label">Valeur personnalisée (minutes)</label>
              <input
                type="number"
                min={1}
                max={1440}
                className="field-input max-w-[140px]"
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
              />
            </div>
            <button
              className="btn-primary"
              disabled={enregistrement || !saisie}
              onClick={() => enregistrer(parseInt(saisie, 10))}
            >
              {enregistrement ? "…" : "Enregistrer"}
            </button>
          </div>
          {message && <p className="mt-2 text-sm text-ok">{message}</p>}
          {erreur && <p className="mt-2 text-sm text-danger">{erreur}</p>}
        </>
      )}
    </div>
  );
}
