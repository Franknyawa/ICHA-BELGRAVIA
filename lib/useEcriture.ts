"use client";

import { useEffect, useState } from "react";
import { peutEcrire, type Module } from "@/lib/permissions";

/** Vrai si l'utilisateur connecté peut agir (pas seulement consulter) sur ce module. */
export function useEcriture(module: Module): boolean {
  const [ecriture, setEcriture] = useState(false);
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setEcriture(peutEcrire(d.role, module)))
      .catch(() => setEcriture(false));
  }, [module]);
  return ecriture;
}
