"use client";

import { libelleGamme, type GammeInfo } from "@/lib/gammesClient";

/**
 * Sélecteur de gamme en pastilles (Toutes / Belgravia / VDV) — même
 * comportement partout dans l'admin : produits, stock, commandes,
 * rapports, tableau de bord.
 */
export default function GammeTabs({
  gammes,
  value,
  onChange,
  avecToutes = true,
}: {
  gammes: GammeInfo[];
  value: string;
  onChange: (gammeId: string) => void;
  avecToutes?: boolean;
}) {
  if (gammes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {avecToutes && (
        <button
          type="button"
          onClick={() => onChange("")}
          className={["choice-pill", value === "" ? "choice-pill-active" : ""].join(" ")}
        >
          Toutes les gammes
        </button>
      )}
      {gammes.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onChange(g.id)}
          className={["choice-pill", value === g.id ? "choice-pill-active" : ""].join(" ")}
        >
          {libelleGamme(g)}
        </button>
      ))}
    </div>
  );
}
