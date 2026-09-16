import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/** Référentiels non codés en dur — villes, types d'établissement, marques —
 *  modifiables depuis l'admin, consommés par le formulaire terrain. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const [villes, types, marques] = await Promise.all([
    prisma.ville.findMany({ where: { actif: true }, orderBy: { nom: "asc" } }),
    prisma.typeEtablissement.findMany({ where: { actif: true }, orderBy: { ordre: "asc" } }),
    prisma.marque.findMany({ where: { actif: true }, orderBy: { ordre: "asc" } }),
  ]);

  return NextResponse.json({ villes, types, marques });
}
