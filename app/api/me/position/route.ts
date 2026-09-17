import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { lat, lng } = await req.json();
  if (typeof lat !== "number" || typeof lng !== "number" || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Position invalide." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { dernierePositionLat: lat, dernierePositionLng: lng, dernierePositionAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
