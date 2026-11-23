import { prisma } from "@/lib/prisma";
import { intervalleJours } from "@/lib/dates";

export type MarqueConcurrente = {
  nom: string;
  nbPoints: number; // nombre de points de vente où la marque a été relevée
  pourcentage: number; // nbPoints / total des points recensés, en %
  prixMoyen: number | null;
  prixMin: number | null;
  prixMax: number | null;
  nbPrix: number; // relevés de prix pris en compte
};

export type CategorieConcurrence = {
  categorie: "MOUSSEUX" | "RTD" | "NON_CLASSEE";
  libelle: string;
  pointsCouverts: number; // points où au moins une marque de la catégorie est présente
  pourcentageCouverture: number;
  marques: MarqueConcurrente[];
};

export type RapportConcurrence = {
  totalPoints: number;
  categories: CategorieConcurrence[];
};

const LIBELLES = { MOUSSEUX: "Vins mousseux", RTD: "Cocktails prêts à boire (RTD)", NON_CLASSEE: "Catégorie non renseignée" } as const;

/** « Moët », « MOET  » et « moet » désignent la même marque. */
export function cleMarque(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const arrondi = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Présence des marques relevées sur le terrain. Chaque point de vente compte une
 * seule fois, d'après sa visite la plus récente dans la période (ce qui est en rayon
 * aujourd'hui, pas la somme de toutes les visites). Les visites archivées sont comptées.
 */
export async function genererRapportConcurrence(f: {
  dateFrom?: string | null;
  dateTo?: string | null;
  villeId?: string | null;
  quartier?: string | null;
}): Promise<RapportConcurrence> {
  const plage = intervalleJours(f.dateFrom, f.dateTo);

  const visites = await prisma.visite.findMany({
    where: {
      ...(plage ? { dateVisite: plage } : {}),
      pointVente: {
        ...(f.villeId ? { villeId: f.villeId } : {}),
        ...(f.quartier ? { quartier: { contains: f.quartier, mode: "insensitive" as const } } : {}),
      },
    },
    orderBy: { dateVisite: "desc" },
    select: {
      pointVenteId: true,
      marquesPresentes: {
        select: { libelleLibre: true, categorie: true, prix: true, marque: { select: { nom: true, categorie: true } } },
      },
    },
  });

  // Dernière visite de chaque point (les visites sont déjà triées de la plus récente à la plus ancienne).
  const derniereParPoint = new Map<string, (typeof visites)[number]>();
  for (const v of visites) if (!derniereParPoint.has(v.pointVenteId)) derniereParPoint.set(v.pointVenteId, v);
  const totalPoints = derniereParPoint.size;

  type Agg = { variantes: Map<string, number>; catalogue?: string; points: number; prix: number[] };
  const parCategorie = new Map<CategorieConcurrence["categorie"], Map<string, Agg>>();
  const pointsParCategorie = new Map<CategorieConcurrence["categorie"], number>();

  for (const visite of derniereParPoint.values()) {
    const vusDansPoint = new Set<string>();
    const categoriesDuPoint = new Set<CategorieConcurrence["categorie"]>();

    for (const mp of visite.marquesPresentes) {
      const nomBrut = (mp.marque?.nom ?? mp.libelleLibre ?? "").trim();
      if (!nomBrut) continue;
      const categorie = (mp.categorie ?? mp.marque?.categorie ?? "NON_CLASSEE") as CategorieConcurrence["categorie"];
      const cle = cleMarque(nomBrut);
      const unique = `${categorie}|${cle}`;
      if (vusDansPoint.has(unique)) continue; // une marque comptée une fois par point
      vusDansPoint.add(unique);
      categoriesDuPoint.add(categorie);

      const marques = parCategorie.get(categorie) ?? new Map<string, Agg>();
      parCategorie.set(categorie, marques);
      const agg: Agg = marques.get(cle) ?? { variantes: new Map<string, number>(), points: 0, prix: [] };
      marques.set(cle, agg);
      agg.points += 1;
      if (mp.marque?.nom) agg.catalogue = mp.marque.nom;
      agg.variantes.set(nomBrut, (agg.variantes.get(nomBrut) ?? 0) + 1);
      const prix = mp.prix === null || mp.prix === undefined ? null : Number(mp.prix);
      if (prix !== null && Number.isFinite(prix) && prix > 0) agg.prix.push(prix);
    }
    for (const c of categoriesDuPoint) pointsParCategorie.set(c, (pointsParCategorie.get(c) ?? 0) + 1);
  }

  const ordre: CategorieConcurrence["categorie"][] = ["MOUSSEUX", "RTD", "NON_CLASSEE"];
  const categories: CategorieConcurrence[] = ordre
    .filter((c) => parCategorie.has(c))
    .map((categorie) => {
      const marques: MarqueConcurrente[] = [...parCategorie.get(categorie)!.values()]
        .map((agg) => {
          const nom = agg.catalogue ?? [...agg.variantes.entries()].sort((a, b) => b[1] - a[1])[0][0];
          const nb = agg.prix.length;
          return {
            nom,
            nbPoints: agg.points,
            pourcentage: totalPoints ? arrondi((agg.points / totalPoints) * 100) : 0,
            prixMoyen: nb ? Math.round(agg.prix.reduce((s, p) => s + p, 0) / nb) : null,
            prixMin: nb ? Math.min(...agg.prix) : null,
            prixMax: nb ? Math.max(...agg.prix) : null,
            nbPrix: nb,
          };
        })
        .sort((a, b) => b.nbPoints - a.nbPoints || a.nom.localeCompare(b.nom, "fr"));
      const couverts = pointsParCategorie.get(categorie) ?? 0;
      return {
        categorie,
        libelle: LIBELLES[categorie],
        pointsCouverts: couverts,
        pourcentageCouverture: totalPoints ? arrondi((couverts / totalPoints) * 100) : 0,
        marques,
      };
    });

  return { totalPoints, categories };
}
