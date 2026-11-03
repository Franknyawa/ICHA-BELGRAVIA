import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aAcces } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Alimente la pastille « Commandes » du menu : commandes en attente de traitement. */
export async function GET() {
  const session = await getSession();
  if (!aAcces(session, "commandes")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const count = await prisma.commande.count({ where: { statut: "NON_TRAITEE", archiveeLe: null } });
  return NextResponse.json({ count });
}
