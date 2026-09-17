"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { IconRoute, IconRadio, IconPin } from "@/components/icons";
import type { PointTracking } from "@/components/CarteTracking";

const CarteTracking = dynamic(() => import("@/components/CarteTracking"), {
  ssr: false,
  loading: () => <div className="flex h-[320px] items-center justify-center text-sm text-ink-muted sm:h-[480px]">Chargement de la carte…</div>,
});

type Agent = { id: string; nom: string; prenom: string };

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

export default function TrackingPage() {
  const [mode, setMode] = useState<"itineraire" | "positions">("itineraire");
  const [date, setDate] = useState(AUJOURDHUI);
  const [commercialId, setCommercialId] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [points, setPoints] = useState<PointTracking[] | null>(null);

  useEffect(() => {
    fetch("/api/utilisateurs?role=COMMERCIAL").then((r) => r.json()).then((d) => setAgents(d.users || []));
  }, []);

  useEffect(() => {
    setPoints(null);
    const params = new URLSearchParams({ mode });
    if (mode === "itineraire") params.set("date", date);
    if (commercialId) params.set("commercialId", commercialId);
    fetch(`/api/tracking?${params.toString()}`).then((r) => r.json()).then((d) => setPoints(d.points || []));
  }, [mode, date, commercialId]);

  return (
    <div>
      <h1 className="mb-5 flex items-center gap-2 font-display text-2xl text-ink">
        <IconPin className="h-5 w-5 text-brass" />
        Tracking terrain
      </h1>

      <div className="mb-4 inline-flex rounded-md border border-line bg-bg-elevated p-1">
        <button
          onClick={() => setMode("itineraire")}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${mode === "itineraire" ? "bg-brass text-bg" : "text-ink-muted"}`}
        >
          <IconRoute className="h-3.5 w-3.5" />
          Itinéraire du jour
        </button>
        <button
          onClick={() => setMode("positions")}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${mode === "positions" ? "bg-brass text-bg" : "text-ink-muted"}`}
        >
          <IconRadio className="h-3.5 w-3.5" />
          Position en direct
        </button>
      </div>

      {mode === "positions" && (
        <p className="mb-4 rounded-md border border-brass/30 bg-brass/10 px-3.5 py-2.5 text-xs text-brass">
          Position envoyée par le téléphone tant que l'app terrain reste ouverte — pas un suivi
          permanent en arrière-plan. L'heure affichée est celle du dernier battement reçu.
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {mode === "itineraire" && (
          <input type="date" className="field-input max-w-[170px]" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
        <select className="field-input max-w-[220px]" value={commercialId} onChange={(e) => setCommercialId(e.target.value)}>
          <option value="">Tous les commerciaux</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
        </select>
      </div>

      <div className="field-card">
        {points === null ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-ink-muted sm:h-[480px]">Chargement…</div>
        ) : points.length === 0 ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-sm text-ink-muted sm:h-[480px]">
            <IconPin className="h-6 w-6" />
            {mode === "itineraire"
              ? "Aucune visite géolocalisée pour cette date."
              : "Aucune position récente — les commerciaux doivent avoir l'app ouverte."}
          </div>
        ) : (
          <CarteTracking points={points} tracerItineraire={mode === "itineraire"} />
        )}
      </div>
    </div>
  );
}
