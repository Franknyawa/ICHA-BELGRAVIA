"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { usePolling } from "@/lib/usePolling";

/** Badge de compteur affiché près du lien "Alertes" dans la nav admin. */
export default function AlertesBadge() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  const rafraichir = () =>
    fetch("/api/alertes/count")
      .then((r) => r.json())
      .then((d) => setCount(d.count || 0))
      .catch(() => {});

  // Revérifie à chaque navigation (ex: après avoir résolu une alerte)...
  useEffect(() => {
    rafraichir();
  }, [pathname]);
  // ... et toutes les 60 s tant que l'onglet est visible.
  usePolling(rafraichir, 60000);

  if (count === 0) return null;

  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">
      {count}
    </span>
  );
}
