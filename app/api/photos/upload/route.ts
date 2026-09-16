import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { stockerPhoto } from "@/lib/storage";

/**
 * Réceptionne une photo capturée sur le terrain (data URL base64) et la
 * transmet à l'adaptateur de stockage (local en dev, S3-compatible en
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
    console.error(e);
    return NextResponse.json({ error: "Échec de l'enregistrement de la photo." }, { status: 500 });
  }
}
