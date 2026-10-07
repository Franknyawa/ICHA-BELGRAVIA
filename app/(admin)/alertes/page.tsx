"use client";

import { useCallback, useEffect, useState } from "react";
import { IconAlert, IconRefresh, IconCheckCircle, IconList, IconClock, IconReceipt } from "@/components/icons";
import { Spinner, ChargementPage } from "@/components/Spinner";

type Alerte = {
  id: string;
  type: "STOCK_FAIBLE" | "LIVRAISON_A_VENIR" | "LIVRAISON_RETARD" | "CREDIT_RETARD";
  message: string;
  createdAt: string;
};

const CONFIG_TYPE: Record<Alerte["type"], { label: string; icon: typeof IconAlert; classe: string }> = {
  STOCK_FAIBLE: { label: "Stock faible", icon: IconList, classe: "bg-warn/10 text-warn" },
  LIVRAISON_A_VENIR: { label: "Livraison à venir", icon: IconClock, classe: "bg-brass/10 text-brass" },
  LIVRAISON_RETARD: { label: "Livraison en retard", icon: IconReceipt, classe: "bg-danger/10 text-danger" },
  CREDIT_RETARD: { label: "Crédit en retard", icon: IconReceipt, classe: "bg-danger/10 text-danger" },
};

const ORDRE_TYPES: Alerte["type"][] = ["STOCK_FAIBLE", "LIVRAISON_RETARD", "LIVRAISON_A_VENIR", "CREDIT_RETARD"];

export default function AlertesPage() {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [compteurs, setCompteurs] = useState<Record<string, number>>({});
  const [type, setType] = useState<string>("");
  const [chargement, setChargement] = useState(true);
  const [generation, setGeneration] = useState(false);
  const [resolution, setResolution] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const params = type ? `?type=${type}` : "";
    const res = await fetch(`/api/alertes${params}`);
    const data = await res.json();
    setAlertes(data.alertes || []);
    const c: Record<string, number> = {};
    for (const a of data.toutes || []) c[a.type] = (c[a.type] || 0) + 1;
    setCompteurs(c);
    setChargement(false);
  }, [type]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function resoudre(id: string) {
    setResolution(id);
    await fetch(`/api/alertes/${id}`, { method: "PATCH" });
    await charger();
    setResolution(null);
  }

  async function generer() {
    setGeneration(true);
    await fetch("/api/alertes/generer", { method: "POST" });
    await charger();
    setGeneration(false);
  }

  const total = Object.values(compteurs).reduce((s, n) => s + n, 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
            <IconAlert className="h-5 w-5 text-brass" />
            Alertes
          </h1>
          <p className="text-sm text-ink-muted">{alertes.length} alerte(s) active(s)</p>
        </div>
        <button className="btn-secondary" onClick={generer} disabled={generation}>
          <IconRefresh className={`h-4 w-4 ${generation ? "animate-spin" : ""}`} />
          {generation && <Spinner className="h-4 w-4" />}
          {generation ? "Génération…" : "Générer maintenant"}
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => setType("")} className={["choice-pill", type === "" ? "choice-pill-active" : ""].join(" ")}>
          Toutes ({total})
        </button>
        {ORDRE_TYPES.map((t) => {
          const count = compteurs[t] || 0;
          if (count === 0 && type !== t) return null;
          return (
            <button key={t} onClick={() => setType(t)} className={["choice-pill", type === t ? "choice-pill-active" : ""].join(" ")}>
              {CONFIG_TYPE[t].label} ({count})
            </button>
          );
        })}
      </div>

      {chargement && <ChargementPage compact />}

      {!chargement && alertes.length === 0 && (
        <div className="field-card flex flex-col items-center gap-2 py-12 text-center">
          <IconCheckCircle className="h-6 w-6 text-ok" />
          <p className="text-sm text-ink-muted">Aucune alerte active — tout est en ordre.</p>
        </div>
      )}

      <div className="space-y-2">
        {alertes.map((a) => {
          const config = CONFIG_TYPE[a.type];
          const Icon = config.icon;
          return (
            <div key={a.id} className="field-card flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.classe}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${config.classe.split(" ")[1]}`}>{config.label}</p>
                  <p className="text-sm text-ink">{a.message}</p>
                  <p className="text-xs text-ink-muted">{new Date(a.createdAt).toLocaleDateString("fr-FR")}</p>
                </div>
              </div>
              <button
                onClick={() => resoudre(a.id)}
                disabled={resolution === a.id}
                className="flex shrink-0 items-center gap-1 rounded-md bg-ok/10 px-2.5 py-1.5 text-xs font-semibold text-ok disabled:opacity-50"
              >
                <IconCheckCircle className="h-3.5 w-3.5" />
                Résolue
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
