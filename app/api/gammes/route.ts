import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listerGammes } from "@/lib/gammes";

/** Gammes de produits actives (BELGRAVIA, VDV…). Lisible par tout utilisateur
 *  connecté : le commercial en a besoin pour choisir la gamme d'une commande. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const gammes = await listerGammes();
  return NextResponse.json({ gammes });
}
