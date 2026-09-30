import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/** Distance approximative en km entre deux points (formule de Haversine). */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Recherche de points de vente pour la sélection du client au moment de
 * prendre une commande — soit par texte (nom d'établissement, quartier,
 * repère ou ville), soit par proximité géographique (lat/lng envoyés par le
 * navigateur — bouton "Autour de moi" du formulaire), soit les deux à la
 * fois (le texte filtre, la position trie par distance croissante).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const latParam = req.nextUrl.searchParams.get("lat");
  const lngParam = req.nextUrl.searchParams.get("lng");
  const lat = latParam ? parseFloat(latParam) : null;
  const lng = lngParam ? parseFloat(lngParam) : null;
  const parGeolocalisation = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);

  if (!parGeolocalisation && q.length < 2) return NextResponse.json({ points: [] });

  const points = await prisma.pointVente.findMany({
    where: {
      ...(q.length >= 2
        ? {
            OR: [
              { nomEtablissement: { contains: q, mode: "insensitive" } },
              { quartier: { contains: q, mode: "insensitive" } },
              { repereQuartier: { contains: q, mode: "insensitive" } },
              { ville: { nom: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(parGeolocalisation ? { latitude: { not: null }, longitude: { not: null } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: parGeolocalisation ? 100 : 8, // on prend un lot plus large avant de trier par distance
    include: { ville: true },
  });

  let resultats = points.map((p) => ({
    id: p.id,
    nomEtablissement: p.nomEtablissement,
    nomVendeur: p.nomVendeur,
    telVendeur: p.telVendeur,
    quartier: p.quartier,
    ville: p.ville?.nom || null,
    distanceKm: parGeolocalisation && p.latitude && p.longitude
      ? Math.round(distanceKm(lat!, lng!, Number(p.latitude), Number(p.longitude)) * 10) / 10
      : null,
  }));

  if (parGeolocalisation) {
    resultats = resultats.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)).slice(0, 8);
  }

  return NextResponse.json({ points: resultats });
}
