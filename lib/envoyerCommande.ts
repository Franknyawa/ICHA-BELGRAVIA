"use client";

export async function envoyerCommande(
  payload: Record<string, unknown>
): Promise<{ id: string; dejaEnregistree: boolean }> {
  const res = await fetch("/api/commandes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Échec de l'enregistrement de la commande.");
  }
  return res.json();
}
