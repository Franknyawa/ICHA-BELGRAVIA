"use client";

import { fetchOuErreurEnvoi } from "./erreurEnvoi";

export async function envoyerCommande(
  payload: Record<string, unknown>
): Promise<{ id: string; dejaEnregistree: boolean }> {
  const res = await fetchOuErreurEnvoi(
    "/api/commandes",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Échec de l'enregistrement de la commande."
  );
  return res.json();
}
