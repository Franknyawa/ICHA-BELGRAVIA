import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { listerGammes } from "@/lib/gammes";

/** Référentiels non codés en dur — villes, types d'établissement, marques,
 *  produits — modifiables depuis l'admin, consommés par les formulaires terrain. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const gammes = await listerGammes();
  const [villes, types, marques, produits, paliersPrix] = await Promise.all([
    prisma.ville.findMany({ where: { actif: true }, orderBy: { nom: "asc" } }),
    prisma.typeEtablissement.findMany({ where: { actif: true }, orderBy: { ordre: "asc" } }),
    prisma.marque.findMany({ where: { actif: true }, orderBy: { ordre: "asc" } }),
    prisma.produit.findMany({ where: { actif: true }, orderBy: { ordre: "asc" } }),
    prisma.palierPrixCarton.findMany({ where: { actif: true }, orderBy: { cartonsMin: "asc" } }),
  ]);

  return NextResponse.json({ villes, types, marques, produits, paliersPrix, gammes });
}
