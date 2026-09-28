import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.ville.createMany({
    data: [{ nom: "Douala" }, { nom: "Yaoundé" }, { nom: "Bafoussam" }],
    skipDuplicates: true,
  });

  await prisma.typeEtablissement.createMany({
    data: [
      { nom: "Cave", ordre: 1 },
      { nom: "Bar", ordre: 2 },
      { nom: "Lounge", ordre: 3 },
      { nom: "Snack", ordre: 4 },
      { nom: "Restaurant / Fast Food", ordre: 5 },
      { nom: "Hôtel", ordre: 6 },
      { nom: "Autre", ordre: 7 },
    ],
    skipDuplicates: true,
  });

  await prisma.marque.createMany({
    data: [
      { nom: "VK", ordre: 1 },
      { nom: "Le Coq", ordre: 2 },
      { nom: "Booster (SABC)", ordre: 3 },
      { nom: "ICE", ordre: 4 },
    ],
    skipDuplicates: true,
  });

  // Anciens produits placeholders (test) : désactivés plutôt que supprimés,
  // pour ne pas casser l'historique des commandes déjà créées avec eux.
  await prisma.produit.updateMany({
    where: {
      nom: {
        in: [
          "Belgravia Mojito 275ml",
          "Belgravia Cosmopolitan 275ml",
          "Belgravia Piña Colada 275ml",
          "Belgravia Spritz 275ml",
        ],
      },
    },
    data: { actif: false },
  });

  // Catalogue produits réel BELGRAVIA — 275ml, vente au carton uniquement.
  // prixUnitaire ici = prix de référence affiché en admin (palier 0-9
  // cartons) ; le prix réellement appliqué à une commande vient du barème
  // PalierPrixCarton, recalculé côté serveur selon le volume total commandé.
  const produitsReels = [
    "Gin & Dry Lemon",
    "Gin & Tonic",
    "Gin & Pink Tonic",
    "Gin & Dark Cherry",
    "Red Square Energising",
    "Red Square Red Ice",
  ];
  for (const [i, nom] of produitsReels.entries()) {
    await prisma.produit.upsert({
      where: { nom },
      update: { actif: true, volumeMl: 275 },
      create: { nom, volumeMl: 275, prixUnitaire: 21500, ordre: i + 1 },
    });
  }

  // Barème de prix par palier de cartons (commande entière, tous produits
  // confondus) — modifiable ensuite depuis l'admin (Paramètres).
  const paliers: { min: number; max: number | null; prix: number }[] = [
    { min: 0, max: 9, prix: 21500 },
    { min: 10, max: 49, prix: 21000 },
    { min: 50, max: 99, prix: 20000 },
    { min: 100, max: 499, prix: 19500 },
    { min: 500, max: null, prix: 19000 },
  ];
  const paliersExistants = await prisma.palierPrixCarton.count();
  if (paliersExistants === 0) {
    await prisma.palierPrixCarton.createMany({
      data: paliers.map((p, i) => ({
        cartonsMin: p.min,
        cartonsMax: p.max,
        prixCarton: p.prix,
        ordre: i + 1,
      })),
    });
  }

  // Une ligne de stock par produit réel, à ajuster ensuite depuis l'admin.
  const produitsCrees = await prisma.produit.findMany({ where: { nom: { in: produitsReels } } });
  for (const p of produitsCrees) {
    await prisma.stock.upsert({
      where: { produitId: p.id },
      update: {},
      create: { produitId: p.id, quantiteCartons: 0, seuilAlerte: 20 },
    });
  }

  const adminHash = await bcrypt.hash("belgravia-admin", 10);
  await prisma.user.upsert({
    where: { identifiant: "admin@belgravia.local" },
    update: {},
    create: {
      identifiant: "admin@belgravia.local",
      passwordHash: adminHash,
      role: "ADMIN",
      nom: "Admin",
      prenom: "Belgravia",
    },
  });

  const commercialHash = await bcrypt.hash("1234", 10);
  await prisma.user.upsert({
    where: { identifiant: "agent1" },
    update: {},
    create: {
      identifiant: "agent1",
      passwordHash: commercialHash,
      role: "COMMERCIAL",
      nom: "Test",
      prenom: "Agent",
    },
  });

  console.log("Seed terminé.");
  console.log("Admin      : admin@belgravia.local / belgravia-admin");
  console.log("Commercial : agent1 / 1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
