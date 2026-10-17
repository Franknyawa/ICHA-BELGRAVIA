import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { PREFIXES_BACK_OFFICE, estBackOffice } from "@/lib/permissions";

const COOKIE_NAME = "belgravia_session";

// Aucune valeur de secours : sans SESSION_SECRET, on refuse tout plutôt que
// de signer/vérifier avec un secret connu de tout le monde.
function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

// Pages du back-office (liste dans lib/permissions.ts). Le middleware ne fait que le tri
// grossier d'après le rôle du cookie ; le contrôle fin par module (avec le rôle lu en base)
// est fait par app/(admin)/layout.tsx et par chaque API.
const PREFIXES_ADMIN = PREFIXES_BACK_OFFICE;

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
    if (isAdminArea && !estBackOffice(role)) return vers("/login");
    // Le layout a besoin du chemin pour contrôler l'accès au module.
    const entetes = new Headers(req.headers);
    entetes.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: entetes } });
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
    "/caisse/:path*",
    "/archives/:path*",
  ],
};
