import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { construireFiltreVisites } from "@/lib/visiteFiltres";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const where = construireFiltreVisites(new URL(req.url).searchParams);

  const visites = await prisma.visite.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      pointVente: { include: { ville: true, type: true, createdBy: true } },
      marquesPresentes: { include: { marque: true } },
    },
  });

  const colonnes = [
    "Date visite", "Agent", "Établissement", "Vendeur", "Tél. vendeur", "Ville", "Quartier",
    "Type", "Statut", "Latitude", "Longitude", "Vend spiritueux", "Marques présentes", "Propose cocktails",
    "Capacité estimée", "Fournisseur", "Potentiel estimé", "Intéressé visite",
    "Répondant", "Veut commander", "Observations",
  ];

  const lignes = visites.map((v) => {
    const pv = v.pointVente;
    const fournisseur = [
      v.fournisseurGrossiste && "Grossiste",
      v.fournisseurMarche && "Marché",
      v.fournisseurLivraison && "Livraison directe",
      v.fournisseurNeSaitPas && "Ne sait pas",
    ].filter(Boolean).join(" / ");
    const marques = v.marquesPresentes.map((m) => m.marque?.nom || m.libelleLibre).filter(Boolean).join(" / ");

    return [
      new Date(v.dateVisite).toLocaleString("fr-FR"),
      `${pv.createdBy.prenom} ${pv.createdBy.nom}`,
      pv.nomEtablissement,
      pv.nomVendeur,
      pv.telVendeur,
      pv.ville?.nom,
      pv.quartier,
      pv.type?.nom || pv.typeAutrePrecision,
      pv.statut,
      pv.latitude,
      pv.longitude,
      v.vendSpiritueux === null ? "" : v.vendSpiritueux ? "Oui" : "Non",
      marques,
      v.proposeCocktails,
      v.capaciteEstimee,
      fournisseur,
      v.potentielEstime,
      v.interesseVisiteCommerciale === null ? "" : v.interesseVisiteCommerciale ? "Oui" : "Non",
      v.repondant === "AUTRE" ? v.repondantAutrePrecision : v.repondant,
      v.veutCommander === null ? "" : v.veutCommander ? "Oui" : "Non",
      v.observations,
    ].map(csvEscape).join(";");
  });

  const csv = "\uFEFF" + [colonnes.join(";"), ...lignes].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="belgravia-visites-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
