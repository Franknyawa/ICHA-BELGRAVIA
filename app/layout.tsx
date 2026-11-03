import type { Metadata, Viewport } from "next";
// Polices auto-hébergées (paquets @fontsource) : le build ne dépend plus de Google Fonts.
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/cormorant-garamond/latin-700.css";
import "@fontsource/cormorant-garamond/latin-400-italic.css";
import "@fontsource/cormorant-garamond/latin-500-italic.css";
import "@fontsource/cormorant-garamond/latin-600-italic.css";
import "@fontsource/cormorant-garamond/latin-700-italic.css";
import "@fontsource/jost/latin-400.css";
import "@fontsource/jost/latin-500.css";
import "@fontsource/jost/latin-600.css";
import "@fontsource/jost/latin-700.css";
// Police du menu latéral : géométrique, très lisible en petit et en gras.
import "@fontsource/plus-jakarta-sans/latin-500.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "./globals.css";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";

export const metadata: Metadata = {
  title: "BELGRAVIA / VDV by SIRI IMPORT",
  description: "Gestion des boissons SIRI IMPORT : recensement terrain, commandes, stock et rapports BELGRAVIA (cocktails RTD) et VDV (Veuve du Vernay)",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF6EF",
  width: "device-width",
  initialScale: 1,
};

// Applique le thème stocké AVANT le premier rendu, pour éviter tout flash
// clair/sombre au chargement. Par défaut : mode clair.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stocke = localStorage.getItem("belgravia-theme");
    if (stocke === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-bg text-ink font-sans antialiased min-h-screen transition-colors">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
