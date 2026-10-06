import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";

const MAX_TENTATIVES = 5;
const VERROUILLAGE_MINUTES = 10;
// Hash factice : on exécute toujours un bcrypt.compare, même si l'identifiant
// n'existe pas, pour que le temps de réponse ne révèle pas quels comptes existent.
const HASH_FACTICE = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.Xv1v1Q7q8pQe3eWw0GZ1yQ0kQ6xK";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const identifiant = typeof body?.identifiant === "string" ? body.identifiant.trim() : "";
  const motDePasse = typeof body?.motDePasse === "string" ? body.motDePasse : "";

  if (!identifiant || !motDePasse || identifiant.length > 100 || motDePasse.length > 200) {
    return NextResponse.json({ error: "Identifiant et mot de passe requis." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { identifiant } });

  if (user?.verrouilleJusqua && user.verrouilleJusqua > new Date()) {
    const minutes = Math.ceil((user.verrouilleJusqua.getTime() - Date.now()) / 60000);
    return NextResponse.json(
      { error: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.` },
      { status: 429 }
    );
  }

  const motDePasseOk = await bcrypt.compare(motDePasse, user?.passwordHash ?? HASH_FACTICE);

  if (!user || !user.actif || !motDePasseOk) {
    if (user) {
      const tentatives = user.tentativesEchec + 1;
      const verrouiller = tentatives >= MAX_TENTATIVES;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          tentativesEchec: verrouiller ? 0 : tentatives,
          verrouilleJusqua: verrouiller ? new Date(Date.now() + VERROUILLAGE_MINUTES * 60000) : null,
        },
      });
    }
    return NextResponse.json({ error: "Identifiants incorrects." }, { status: 401 });
  }

  if (user.tentativesEchec > 0 || user.verrouilleJusqua) {
    await prisma.user.update({ where: { id: user.id }, data: { tentativesEchec: 0, verrouilleJusqua: null } });
  }

  await createSession(user.id, user.role, user.nom, user.prenom, req.headers.get("user-agent"));

  return NextResponse.json({ role: user.role });
}
