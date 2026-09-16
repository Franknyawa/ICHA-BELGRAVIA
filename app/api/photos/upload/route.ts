import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { stockerPhoto } from "@/lib/storage";

// L'envoi FTP/SFTP vers l'hébergement peut prendre plus que la limite par
// défaut des fonctions Vercel (10s sur le plan Hobby) : on demande le
// maximum disponible pour éviter un échec silencieux par timeout.
export const maxDuration = 60;

/**
 * Réceptionne une photo capturée sur le terrain (data URL base64) et la
 * transmet à l'adaptateur de stockage (local en dev, FTP/SFTP/S3 en
 * production — voir lib/storage.ts et STORAGE_DRIVER dans .env).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { dataUrl } = await req.json();
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "Image invalide." }, { status: 400 });
  }

  try {
    const url = await stockerPhoto(dataUrl);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[upload photo] échec :", e);
    const message = e instanceof Error ? e.message : "Échec de l'enregistrement de la photo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
