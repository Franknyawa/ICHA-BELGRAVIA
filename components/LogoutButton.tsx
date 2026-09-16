"use client";

import { useRouter } from "next/navigation";
import { IconLogout } from "@/components/icons";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-brass"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      <IconLogout className="h-4 w-4" />
      Déconnexion
    </button>
  );
}
