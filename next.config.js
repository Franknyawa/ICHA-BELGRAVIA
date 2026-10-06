/** @type {import('next').NextConfig} */
const enTetesSecurite = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Géolocalisation et caméra autorisées pour l'app elle-même (terrain), le reste coupé.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: enTetesSecurite },
      // Les réponses d'API ne doivent jamais être mises en cache (données privées).
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};
module.exports = nextConfig;
