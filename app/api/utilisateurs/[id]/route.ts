import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/** Modification d'un compte : profil (nom/prénom/téléphone/ville/rôle),
 *  activation/désactivation, et/ou réinitialisation du mot de passe. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { actif, nom, prenom, telephone, villeId, role, nouveauMotDePasse } = await req.json();

  const data: Prisma.UserUpdateInput = {};
  if (actif !== undefined) data.actif = !!actif;
  if (nom !== undefined) data.nom = nom;
  if (prenom !== undefined) data.prenom = prenom;
  if (telephone !== undefined) data.telephone = telephone || null;
  if (villeId !== undefined) data.ville = villeId ? { connect: { id: villeId } } : { disconnect: true };
  if (role !== undefined) data.role = role;
  if (nouveauMotDePasse) data.passwordHash = await bcrypt.hash(nouveauMotDePasse, 10);

  const user = await prisma.user.update({ where: { id: params.id }, data });
  return NextResponse.json({ id: user.id });
}

/** Suppression d'un compte — refusée avec un message clair si des visites,
 *  points de vente ou commandes lui sont rattachés (intégrité de l'historique) :
 *  désactiver le compte est alors la bonne alternative. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  if (params.id === session.userId) {
    return NextResponse.json({ error: "Impossible de supprimer votre propre compte." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId: params.id } });
      await tx.user.delete({ where: { id: params.id } });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "Impossible de supprimer : ce compte a des visites, points de vente ou commandes rattachés. Désactivez-le plutôt." },
        { status: 409 }
      );
    }
    throw e;
  }
}
