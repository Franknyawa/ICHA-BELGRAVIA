import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { construireFiltreVisites } from "@/lib/visiteFiltres";
import { libelleTypes, libelleRepondant } from "@/lib/typesEtablissement";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Neutralise l'injection de formule (Excel/Sheets) : une cellule qui
  // commence par = + - @ serait exécutée à l'ouverture du fichier.
  if (/^[=+\-@\t\r]/.test(str) && Number.isNaN(Number(str))) str = "'" + str;
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
      pointVente: { include: { ville: true, type: true, typesLies: { include: { type: true } }, createdBy: true } },
      marquesPresentes: { include: { marque: true } },
    },
  });

  const colonnes = [
    "Date visite", "Agent", "Établissement", "Répondant", "Nom du contact", "Tél. du contact", "Nom du patron", "Tél. du patron", "Ville", "Quartier",
    "Type", "Latitude", "Longitude", "Vend spiritueux", "Vins mousseux / Champagnes (prix FCFA)",
    "Cocktails RTD (prix FCFA)", "Autres marques",
    "Capacité estimée", "Salle climatisée", "Écran TV", "Jours / heures d'affluence", "Fournisseur", "Potentiel estimé", "Intéressé visite",
    "Veut commander", "Observations",
  ];

  const lignes = visites.map((v) => {
    const pv = v.pointVente;
    const fournisseur = [
      v.fournisseurGrossiste && "Grossiste",
      v.fournisseurMarche && "Marché",
      v.fournisseurLivraison && "Livraison directe",
      v.fournisseurAutre && (v.fournisseurAutrePrecision ? `Autre (${v.fournisseurAutrePrecision})` : "Autre"),
      v.fournisseurNeSaitPas && "Ne sait pas",
    ].filter(Boolean).join(" / ");
    const libelleMarque = (m: (typeof v.marquesPresentes)[number]) => {
      const nom = m.marque?.nom || m.libelleLibre;
      if (!nom) return null;
      return m.prix !== null && m.prix !== undefined ? `${nom} (${Math.round(Number(m.prix))})` : nom;
    };
    // Catégorie portée par la ligne elle-même (nouveaux formulaires) ou, pour
    // les anciennes visites sans catégorie, par la marque du référentiel.
    const categorieDe = (m: (typeof v.marquesPresentes)[number]) => m.categorie ?? m.marque?.categorie ?? null;
    const parCategorie = (cat: "MOUSSEUX" | "RTD") =>
      v.marquesPresentes.filter((m) => categorieDe(m) === cat).map(libelleMarque).filter(Boolean).join(" / ");
    const autres = v.marquesPresentes.filter((m) => !categorieDe(m)).map(libelleMarque).filter(Boolean).join(" / ");
    const affluence = (
      (v.affluence as { jour: string; creneaux: string[] }[] | null) || []
    )
      .map((a) => `${a.jour}: ${a.creneaux.join("+")}`)
      .join(" | ");

    return [
      new Date(v.dateVisite).toLocaleString("fr-FR"),
      `${pv.createdBy.prenom} ${pv.createdBy.nom}`,
      pv.nomEtablissement,
      libelleRepondant(v.repondant, v.repondantAutrePrecision),
      pv.nomVendeur,
      pv.telVendeur,
      pv.nomPatron,
      pv.telPatron,
      pv.ville?.nom,
      pv.quartier,
      libelleTypes(pv),
      pv.latitude,
      pv.longitude,
      v.vendSpiritueux === null ? "" : v.vendSpiritueux ? "Oui" : "Non",
      parCategorie("MOUSSEUX"),
      parCategorie("RTD"),
      autres,
      v.capaciteEstimee,
      v.salleClimatisee === null ? "" : v.salleClimatisee ? "Oui" : "Non",
      v.ecranTv === null ? "" : v.ecranTv ? "Oui" : "Non",
      affluence,
      fournisseur,
      v.potentielEstime,
      v.interesseVisiteCommerciale === null ? "" : v.interesseVisiteCommerciale ? "Oui" : "Non",
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
