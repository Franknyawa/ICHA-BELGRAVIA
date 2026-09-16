import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const jost = Jost({
  subsets: ["latin"],
  variable: "--font-jost",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "BELGRAVIA — Recensement terrain",
  description: "Recensement et qualification des points de vente BELGRAVIA",
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
    <html lang="fr" className={`${cormorant.variable} ${jost.variable}`}>
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
