"use client";

import BadgeCompteur from "@/components/BadgeCompteur";

/** Pastille des alertes actives (menu admin). */
export default function AlertesBadge() {
  return <BadgeCompteur url="/api/alertes/count" />;
}
