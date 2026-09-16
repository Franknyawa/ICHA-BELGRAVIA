import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "belgravia_session";

function getSecret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isCommercialArea = pathname.startsWith("/terrain");
  const isAdminArea = pathname.startsWith("/dashboard") || pathname.startsWith("/utilisateurs");

  if (!isCommercialArea && !isAdminArea) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    if (isCommercialArea && role !== "COMMERCIAL") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (isAdminArea && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/terrain/:path*", "/dashboard/:path*", "/utilisateurs/:path*"],
};
