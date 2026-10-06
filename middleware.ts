import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "belgravia_session";

// Aucune valeur de secours : sans SESSION_SECRET, on refuse tout plutôt que
// de signer/vérifier avec un secret connu de tout le monde.
function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

const PREFIXES_ADMIN = [
  "/dashboard",
  "/utilisateurs",
  "/statistiques",
  "/commandes",
  "/produits",
  "/tableau-de-bord",
  "/parametres",
  "/tracking",
  "/points-de-vente",
  "/rapports",
  "/stock",
  "/factures",
  "/alertes",
];

function sous(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isCommercialArea = sous(pathname, "/terrain");
  const isAdminArea = PREFIXES_ADMIN.some((p) => sous(pathname, p));
  if (!isCommercialArea && !isAdminArea) return NextResponse.next();

  const vers = (chemin: string) => NextResponse.redirect(new URL(chemin, req.url));

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const secret = getSecret();
  if (!token || !secret) return vers("/login");

  try {
    const { payload } = await jwtVerify(token, secret);
    const role = payload.role as string;
    if (isCommercialArea && role !== "COMMERCIAL") return vers("/login");
    if (isAdminArea && role !== "ADMIN") return vers("/login");
    return NextResponse.next();
  } catch {
    return vers("/login");
  }
}

export const config = {
  matcher: [
    "/terrain/:path*",
    "/dashboard/:path*",
    "/utilisateurs/:path*",
    "/statistiques/:path*",
    "/commandes/:path*",
    "/produits/:path*",
    "/tableau-de-bord/:path*",
    "/parametres/:path*",
    "/tracking/:path*",
    "/points-de-vente/:path*",
    "/rapports/:path*",
    "/stock/:path*",
    "/factures/:path*",
    "/alertes/:path*",
  ],
};
