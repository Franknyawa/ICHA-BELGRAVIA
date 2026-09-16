"use client";

import { useEffect } from "react";

export default function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* échec silencieux — l'app fonctionne aussi sans SW, juste sans cache offline */
      });
    }
  }, []);
  return null;
}
