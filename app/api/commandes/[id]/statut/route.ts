import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const TRANSITIONS_VALIDES: Record<string, string[]> = {
  NON_TRAITEE: ["EN_COURS_LIVRAISON"],
  EN_COURS_LIVRAISON: ["LIVREE", "NON_TRAITEE"],
  LIVREE: [],
};

/**
 * Change le statut d'une commande — le passage à EN_COURS_LIVRAISON
 * ("Valider") crée une notification pour le commercial qui a enregistré la
 * commande, avec le nom du vendeur et le quartier du point de vente, et
 * l'émet en temps réel (SSE) s'il est connecté (voir
 * components/NotificationBanner.tsx).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { statut } = await req.json();
  if (!["NON_TRAITEE", "EN_COURS_LIVRAISON", "LIVREE"].includes(statut)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }

  const commande = await prisma.commande.findUnique({
    where: { id: params.id },
    include: { pointVente: true },
  });
  if (!commande) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });

  if (!TRANSITIONS_VALIDES[commande.statut]?.includes(statut)) {
    return NextResponse.json(
      { error: `Impossible de passer de ${commande.statut} à ${statut}.` },
      { status: 409 }
    );
  }

  const misAJour = await prisma.commande.update({
    where: { id: params.id },
    data: { statut },
  });

  if (statut === "EN_COURS_LIVRAISON") {
    const nomClient = commande.pointVente.nomVendeur || commande.pointVente.nomEtablissement;
    const message = `Commande de ${nomClient}${
      commande.pointVente.quartier ? ` (${commande.pointVente.quartier})` : ""
    } en cours de livraison.`;

    // Le commercial la reçoit au prochain sondage (≤ 20 s), voir NotificationBanner.
    await prisma.notification.create({
      data: { commercialId: commande.commercialId, commandeId: commande.id, message },
    });
  }

  return NextResponse.json({ id: misAJour.id, statut: misAJour.statut });
}
