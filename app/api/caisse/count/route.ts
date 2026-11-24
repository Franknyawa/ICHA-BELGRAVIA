import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Pastille « Caisse » du menu : opérations enregistrées depuis la dernière ouverture de la
 * page Caisse par cette personne (le navigateur transmet l'instant en paramètre `depuis`).
 * Les opérations saisies par la personne elle-même ne comptent pas.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!aAcces(session, "caisse")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  const depuis = new Date(new URL(req.url).searchParams.get("depuis") || "");
  if (Number.isNaN(depuis.getTime())) return NextResponse.json({ count: 0 });
  const count = await prisma.operationCaisse.count({
    where: { createdAt: { gt: depuis }, categorie: { not: "TRANSFERT" }, NOT: { creeParId: session.userId } },
  });
  return NextResponse.json({ count });
}
