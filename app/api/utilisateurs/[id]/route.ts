import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { actif } = await req.json();
  const user = await prisma.user.update({ where: { id: params.id }, data: { actif: !!actif } });
  return NextResponse.json({ id: user.id, actif: user.actif });
}
