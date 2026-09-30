"use client";

import { useCallback, useEffect, useState } from "react";
import { IconTrend } from "@/components/icons";

type Notification = { id: string; message: string; lu: boolean; createdAt: string };

/**
 * Affiche les notifications adressées au commercial connecté (ex. "commande
 * en cours de livraison" — voir app/api/commandes/[id]/statut/route.ts).
 * Charge la liste au montage, reste à jour en temps réel via SSE, et permet
 * de les marquer comme lues individuellement ou toutes à la fois.
 */
export default function NotificationBanner() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const charger = useCallback(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");
    source.addEventListener("nouvelle-notification", (e) => {
      try {
        const notif = JSON.parse((e as MessageEvent).data);
        setNotifications((prev) => [notif, ...prev]);
      } catch {
        /* ignore */
      }
    });
    return () => source.close();
  }, []);

  async function marquerLue(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, lu: true } : n)));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  const nonLues = notifications.filter((n) => !n.lu);
  if (nonLues.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {nonLues.map((n) => (
        <div
          key={n.id}
          className="flex items-start justify-between gap-3 rounded-md border border-ok/40 bg-ok/10 px-3.5 py-2.5 text-sm"
        >
          <div className="flex items-start gap-2">
            <IconTrend className="mt-0.5 h-4 w-4 flex-shrink-0 text-ok" />
            <span className="text-ink">{n.message}</span>
          </div>
          <button
            className="flex-shrink-0 text-xs font-medium text-ink-muted hover:text-ink"
            onClick={() => marquerLue(n.id)}
          >
            Marquer comme lu
          </button>
        </div>
      ))}
    </div>
  );
}
