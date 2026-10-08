"use client";

import { useRouter } from "next/navigation";
import { IconLogout } from "@/components/icons";
import { effacerVerrou } from "@/lib/verrouLocal";
import { viderCachesHorsLigne } from "@/lib/horsLigne";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-brass"
      onClick={async () => {
        let deconnecte = false;
        try {
          const res = await fetch("/api/auth/logout", { method: "POST" });
          deconnecte = res.ok;
        } catch {
          /* hors-ligne : voir plus bas */
        }
        // Déconnexion confirmée par le serveur : on efface l'accès hors-ligne
        // et les données mises en cache sur cet appareil. Hors-ligne, on
        // conserve l'accès (sinon l'agent serait enfermé dehors) et on revient
        // simplement à l'écran de déverrouillage.
        if (deconnecte) {
          await effacerVerrou();
          await viderCachesHorsLigne();
        }
        window.location.assign("/login");
      }}
    >
      <IconLogout className="h-4 w-4" />
      Déconnexion
    </button>
  );
}
