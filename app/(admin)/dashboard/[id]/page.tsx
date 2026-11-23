import { redirect, notFound } from "next/navigation";
import { aAcces } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Ancien lien de détail d'une visite : on ouvre la fiche du point de vente (visites détaillées incluses). */
export default async function DetailVisite({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!aAcces(session, "visites")) redirect("/login");
  const v = await prisma.visite.findUnique({ where: { id: params.id }, select: { pointVenteId: true } });
  if (!v) notFound();
  redirect(`/points-de-vente/${v.pointVenteId}#visite-${params.id}`);
}
