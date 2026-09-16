"use client";

import { useEffect, useState } from "react";
import { IconInstall } from "@/components/icons";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallButton() {
  const [evenement, setEvenement] = useState<BeforeInstallPromptEvent | null>(null);
  const [installe, setInstalle] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setEvenement(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalle(true);
      setEvenement(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!evenement || installe) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await evenement.prompt();
        await evenement.userChoice;
        setEvenement(null);
      }}
      className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-brass/60 hover:text-brass"
    >
      <IconInstall className="h-4 w-4" />
      Installer l&apos;app
    </button>
  );
}
