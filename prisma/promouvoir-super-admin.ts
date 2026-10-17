/**
 * Promeut un compte en SUPER_ADMIN (contrôle total).
 *
 *   npx tsx prisma/promouvoir-super-admin.ts                      -> liste les comptes admin
 *   npx tsx prisma/promouvoir-super-admin.ts --identifiant=xxx    -> promeut ce compte
 *
 * Après la promotion, la personne doit se déconnecter puis se reconnecter.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--identifiant="));
  const identifiant = arg?.split("=")[1]?.trim();

  if (!identifiant) {
    const comptes = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      select: { identifiant: true, nom: true, prenom: true, role: true, actif: true },
      orderBy: { createdAt: "asc" },
    });
    console.log("Comptes admin :");
    for (const c of comptes) console.log(` - ${c.identifiant} (${c.prenom} ${c.nom}) : ${c.role}${c.actif ? "" : " [désactivé]"}`);
    console.log("\nPour promouvoir : npx tsx prisma/promouvoir-super-admin.ts --identifiant=<identifiant>");
    return;
  }

  const user = await prisma.user.findUnique({ where: { identifiant: identifiant } });
  if (!user) throw new Error(`Aucun compte avec l'identifiant "${identifiant}".`);
  await prisma.user.update({ where: { id: user.id }, data: { role: "SUPER_ADMIN", actif: true } });
  await prisma.session.updateMany({ where: { userId: user.id }, data: { revoked: true } });
  console.log(`${user.prenom} ${user.nom} (${identifiant}) est maintenant SUPER_ADMIN. Reconnexion nécessaire.`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
