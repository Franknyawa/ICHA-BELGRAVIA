import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { v4 as uuid } from "uuid";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

const COOKIE_NAME = "belgravia_session";
const SESSION_DURATION_HOURS = 12;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET manquant dans les variables d'environnement");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sessionId: string;
  userId: string;
  role: Role;
  nom: string;
  prenom: string;
};

/** Crée une session en base (révocable) + le cookie JWT correspondant. */
export async function createSession(userId: string, role: Role, nom: string, prenom: string) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: { id: uuid(), userId, expiresAt },
  });

  const token = await new SignJWT({ userId, role, nom, prenom } satisfies Omit<SessionPayload, "sessionId">)
    .setProtectedHeader({ alg: "HS256" })
    .setJti(session.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sessionId = payload.jti as string;
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.revoked || session.expiresAt < new Date()) return null;
    return {
      sessionId,
      userId: payload.userId as string,
      role: payload.role as Role,
      nom: payload.nom as string,
      prenom: payload.prenom as string,
    };
  } catch {
    return null;
  }
}

export async function destroySession() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret());
      await prisma.session.update({ where: { id: payload.jti as string }, data: { revoked: true } });
    } catch {
      /* token déjà invalide, rien à révoquer */
    }
  }
  cookies().delete(COOKIE_NAME);
}
