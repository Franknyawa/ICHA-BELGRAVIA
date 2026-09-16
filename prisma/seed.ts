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
