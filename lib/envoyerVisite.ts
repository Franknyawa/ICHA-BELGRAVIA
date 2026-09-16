"use client";

import type { PhotoEnAttente } from "./offlineQueue";

/**
 * Envoie une visite : upload des photos qui n'ont pas encore d'URL, puis
 * création de la visite. Lève une erreur si une étape échoue (réseau coupé
 * notamment) — l'appelant décide alors de mettre la visite en file d'attente
 * hors-ligne plutôt que de la perdre.
 */
export async function envoyerVisite(
  payload: Record<string, unknown>,
  photos: PhotoEnAttente[]
): Promise<{ id: string; dejaEnregistree: boolean }> {
  const photosAvecUrl: { uuidClient: string; url: string }[] = [];

  for (const photo of photos) {
    if (photo.url) {
      photosAvecUrl.push({ uuidClient: photo.uuidClient, url: photo.url });
      continue;
    }
    const res = await fetch("/api/photos/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: photo.dataUrl }),
    });
    if (!res.ok) throw new Error("Échec de l'envoi d'une photo.");
    const data = await res.json();
    photosAvecUrl.push({ uuidClient: photo.uuidClient, url: data.url });
  }

  const res = await fetch("/api/visites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, photos: photosAvecUrl }),
  });
  if (!res.ok) throw new Error("Échec de l'enregistrement de la visite.");
  return res.json();
}
