import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { v4 as uuid } from "uuid";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

const COOKIE_NAME = "belgravia_session";
// Borne absolue du cookie/JWT — indépendante du réglage d'inactivité
// ci-dessous. On ne peut pas rafraîchir ce cookie à chaque requête (les
// Server Components ne peuvent pas écrire de cookie), donc il reste large
// et c'est la vérification d'inactivité qui fait le vrai travail de
// déconnexion automatique.
const SESSION_DURATION_HOURS = 12;

const CLE_DUREE_INACTIVITE = "duree_inactivite_minutes";
const DUREE_INACTIVITE_DEFAUT_MINUTES = 30;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET manquant dans les variables d'environnement");
  return new TextEncoder().encode(secret);
}

/**
 * Durée d'inactivité (en minutes) avant déconnexion automatique —
 * réglable depuis l'admin (Paramètres). C'est cette valeur, et non la
 * durée de vie du cookie, qui gouverne la déconnexion réelle : elle est
 * appliquée côté client (composant InactivityLogout, sur vrais événements
 * souris/clavier/tactile) et vérifiée ici en filet de sécurité via
 * `lastSeenAt`, pour qu'une session laissée inactive reste invalide même
 * si le JavaScript client n'a pas pu s'exécuter (onglet fermé, etc.).
 */
let cacheDuree: { minutes: number; expire: number } | null = null;

export async function getDureeInactiviteMinutes(): Promise<number> {
  // Mise en cache 60 s : cette valeur est lue à CHAQUE requête
  // authentifiée, inutile d'interroger la base à chaque fois.
  if (cacheDuree && cacheDuree.expire > Date.now()) return cacheDuree.minutes;
  const minutes = await lireDureeInactiviteEnBase();
  cacheDuree = { minutes, expire: Date.now() + 60_000 };
  return minutes;
}

async function lireDureeInactiviteEnBase(): Promise<number> {
  const param = await prisma.parametreSysteme.findUnique({ where: { cle: CLE_DUREE_INACTIVITE } });
  const minutes = param ? Number(param.valeur) : NaN;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DUREE_INACTIVITE_DEFAUT_MINUTES;
}

export async function definirDureeInactiviteMinutes(minutes: number): Promise<void> {
  await prisma.parametreSysteme.upsert({
    where: { cle: CLE_DUREE_INACTIVITE },
    update: { valeur: String(minutes) },
    create: { cle: CLE_DUREE_INACTIVITE, valeur: String(minutes) },
  });
  cacheDuree = null;
}

export type SessionPayload = {
  sessionId: string;
  userId: string;
  role: Role;
  nom: string;
  prenom: string;
};

/** Crée une session en base (révocable) + le cookie JWT correspondant. */
export async function createSession(
  userId: string,
  role: Role,
  nom: string,
  prenom: string,
  userAgent?: string | null
) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: { id: uuid(), userId, expiresAt, userAgent: userAgent || null },
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
    // Une seule requête : session + état du compte. Un compte désactivé
    // perd l'accès immédiatement, sans attendre l'expiration de sa session.
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: { select: { actif: true } } },
    });
    if (!session || session.revoked || session.expiresAt < new Date() || !session.user.actif) return null;

    // Déconnexion automatique après N minutes d'inactivité (réglable —
    // Paramètres) : filet de sécurité serveur, en plus de la déconnexion
    // active côté client (InactivityLogout, sur vrais événements
    // utilisateur). Une session jamais revue depuis plus longtemps que la
    // durée configurée est traitée comme expirée et révoquée.
    const dureeMinutes = await getDureeInactiviteMinutes();
    const inactifDepuis = Date.now() - session.lastSeenAt.getTime();
    if (inactifDepuis > dureeMinutes * 60 * 1000) {
      await prisma.session.update({ where: { id: sessionId }, data: { revoked: true } }).catch(() => {});
      return null;
    }

    // Alimente "dernière activité" affichée dans le back office (voir
    // "Sessions actives" — app/(admin)/utilisateurs/page.tsx). Best-effort,
    // ne doit jamais faire échouer la requête en cours.
    // Limité à 1 écriture/minute par session (au lieu d'une à chaque appel API).
    if (inactifDepuis > 60_000) {
      prisma.session.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } }).catch(() => {});
    }

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
