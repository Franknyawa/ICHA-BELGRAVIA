"use client";

import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type PointTracking = {
  id: string;
  heure: string;
  lat: number;
  lng: number;
  libelle: string;
  commercialId: string;
  commercialNom: string;
};

// Palette stable par agent — le même agent garde toujours la même couleur
// sur la carte, pour repérer son trajet d'un coup d'œil.
const PALETTE = ["#A6791E", "#4C7A4F", "#7A2E3B", "#2D5A6B", "#8F4416", "#5B4B8A"];

function couleurPour(commercialId: string) {
  let hash = 0;
  for (const ch of commercialId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function AjusterVue({ points }: { points: PointTracking[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p): [number, number] => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }, [points, map]);
  return null;
}

export default function CarteTracking({ points, tracerItineraire }: { points: PointTracking[]; tracerItineraire: boolean }) {
  const parAgent = useMemo(() => {
    const map = new Map<string, { nom: string; couleur: string; points: PointTracking[] }>();
    for (const p of points) {
      const existant = map.get(p.commercialId);
      if (existant) existant.points.push(p);
      else map.set(p.commercialId, { nom: p.commercialNom, couleur: couleurPour(p.commercialId), points: [p] });
    }
    return [...map.values()];
  }, [points]);

  const centre: [number, number] = points.length
    ? [points.reduce((s, p) => s + p.lat, 0) / points.length, points.reduce((s, p) => s + p.lng, 0) / points.length]
    : [4.05, 9.7];

  return (
    <div>
      <MapContainer center={centre} zoom={points.length ? 12 : 6} className="h-[320px] w-full rounded-lg sm:h-[480px]">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <AjusterVue points={points} />

        {tracerItineraire &&
          parAgent.map((a) => (
            <Polyline
              key={a.nom}
              positions={a.points.map((p): [number, number] => [p.lat, p.lng])}
              pathOptions={{ color: a.couleur, weight: 3, opacity: 0.6, dashArray: "6 6" }}
            />
          ))}

        {points.map((p, i) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={7}
            pathOptions={{ color: couleurPour(p.commercialId), fillColor: couleurPour(p.commercialId), fillOpacity: 0.85, weight: 2 }}
          >
            <Popup>
              <strong>{p.libelle}</strong>
              <br />
              {p.commercialNom}
              <br />
              {tracerItineraire ? `Arrêt n°${i + 1} — ` : ""}
              {new Date(p.heure).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {parAgent.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {parAgent.map((a) => (
            <span key={a.nom} className="flex items-center gap-1.5 rounded-full border border-line bg-bg-elevated px-3 py-1.5 text-xs text-ink-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.couleur }} />
              {a.nom} ({a.points.length})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
