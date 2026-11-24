import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aEcriture } from "@/lib/permissions";
import { emettreDocumentCorrectif, RefusDocument } from "@/lib/documentsCorrectifs";

export const dynamic = "force-dynamic";

/** Émet une facture retour (FR) ou une facture d'avoir (FA) — admin et super admin. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!aEcriture(session, "commandes")) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (!b || typeof b.commandeId !== "string" || (b.type !== "FR" && b.type !== "FA")) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  try {
    const r = await prisma.$transaction(
      (tx) =>
        emettreDocumentCorrectif(tx, {
          type: b.type,
          commandeId: b.commandeId,
          lignes: Array.isArray(b.lignes) ? b.lignes.map((l: { ligneId: string; quantite: number }) => ({ ligneId: String(l.ligneId), quantite: Number(l.quantite) })) : [],
          montantLibre: Number(b.montantLibre) || 0,
          motif: String(b.motif || ""),
          destination: b.destination === "AVARIES" ? "AVARIES" : "STOCK",
          canal: typeof b.canal === "string" ? b.canal : undefined,
          creeParId: session!.userId,
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof RefusDocument) return NextResponse.json({ error: e.message }, { status: e.status });
    if ((e as { code?: string })?.code === "P2034") {
      return NextResponse.json({ error: "Cette facture vient d'être modifiée. Réessayez." }, { status: 409 });
    }
    throw e;
  }
}
