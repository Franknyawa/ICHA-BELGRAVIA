import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Deux modes de tracking, sélectionnés par ?mode= :
 * - "itineraire" (défaut) : les points de vente recensés par un agent au
 *   cours d'une journée donnée, dans l'ordre chronologique — reconstitue
 *   le trajet réellement parcouru ce jour-là.
 * - "positions" : la dernière position connue de chaque commercial actif,
 *   alimentée par le battement envoyé depuis la PWA (voir
 *   components/LocationHeartbeat.tsx). Ce n'est pas un suivi permanent en
 *   arrière-plan — juste la dernière position reçue tant que l'app était
 *   ouverte, avec son horodatage.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") === "positions" ? "positions" : "itineraire";
  const commercialId = searchParams.get("commercialId") || undefined;

  if (mode === "positions") {
    const users = await prisma.user.findMany({
      where: {
        role: "COMMERCIAL",
        actif: true,
        dernierePositionLat: { not: null },
        dernierePositionLng: { not: null },
        ...(commercialId ? { id: commercialId } : {}),
      },
      orderBy: { dernierePositionAt: "desc" },
    });

    return NextResponse.json({
      points: users.map((u) => ({
        id: u.id,
        heure: u.dernierePositionAt!.toISOString(),
        lat: Number(u.dernierePositionLat),
        lng: Number(u.dernierePositionLng),
        libelle: "Position actuelle",
        commercialId: u.id,
        commercialNom: `${u.prenom} ${u.nom}`,
      })),
    });
  }

  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const debut = new Date(`${date}T00:00:00`);
  const fin = new Date(`${date}T23:59:59`);

  const visites = await prisma.visite.findMany({
    where: {
      createdAt: { gte: debut, lte: fin },
      pointVente: { latitude: { not: null }, longitude: { not: null } },
      ...(commercialId ? { commercialId } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: { pointVente: true, commercial: true },
  });

  return NextResponse.json({
    points: visites.map((v) => ({
      id: v.id,
      heure: v.createdAt.toISOString(),
      lat: Number(v.pointVente.latitude),
      lng: Number(v.pointVente.longitude),
      libelle: v.pointVente.nomEtablissement,
      commercialId: v.commercialId,
      commercialNom: `${v.commercial.prenom} ${v.commercial.nom}`,
    })),
  });
}
