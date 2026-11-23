import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aEcriture } from "@/lib/permissions";
import { dateValide, debutJour } from "@/lib/dates";

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
  if (!aEcriture(session, "commandes")) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { statut, dateLivraison } = await req.json();
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

  // Validation : date de livraison prévue (optionnelle). Livraison effectuée :
  // la commande entre dans « Commandes à encaisser » de la caisse (livreeLe).
  // L'update est conditionné à l'ancien statut : deux clics simultanés ne
  // passent pas tous les deux.
  const data: { statut: typeof statut; dateLivraison?: Date; livreeLe?: Date | null } = { statut };
  if (statut === "EN_COURS_LIVRAISON" && dateValide(dateLivraison)) data.dateLivraison = debutJour(dateLivraison);
  if (statut === "LIVREE") data.livreeLe = new Date();
  if (statut === "NON_TRAITEE") data.livreeLe = null;

  const { count } = await prisma.commande.updateMany({ where: { id: params.id, statut: commande.statut }, data });
  if (count === 0) {
    return NextResponse.json({ error: "Cette commande vient d'être modifiée. Rafraîchissez la page." }, { status: 409 });
  }
  const misAJour = { id: params.id, statut };

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
