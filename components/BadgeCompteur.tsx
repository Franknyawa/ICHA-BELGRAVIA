"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { usePolling } from "@/lib/usePolling";

/**
 * Pastille rouge de compteur dans le menu. Lit `{ count }` sur l'URL donnée,
 * se met à jour à chaque navigation et toutes les 60 s tant que l'onglet est visible.
 */
export default function BadgeCompteur({ url }: { url: string }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  const rafraichir = () =>
    fetch(url)
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => setCount(d.count || 0))
      .catch(() => {});

  useEffect(() => {
    rafraichir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  usePolling(rafraichir, 60000);

  if (count === 0) return null;

  return (
    <span
      aria-label={`${count} en attente`}
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold leading-none text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
