"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type Point = {
  id: string;
  nom: string;
  statut: string;
  lat: number;
  lng: number;
  potentiel: string | null;
};

const COULEUR_POTENTIEL: Record<string, string> = {
  FORT: "#4C7A4F",
  MOYEN: "#B9791E",
  FAIBLE: "#8A7A63",
};

export default function CarteBelgravia({ points }: { points: Point[] }) {
  const centre: [number, number] =
    points.length > 0
      ? [points.reduce((s, p) => s + p.lat, 0) / points.length, points.reduce((s, p) => s + p.lng, 0) / points.length]
      : [4.05, 9.7]; // Douala par défaut

  return (
    <MapContainer center={centre} zoom={points.length ? 12 : 6} className="h-[480px] w-full rounded-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={8}
          pathOptions={{
            color: p.potentiel ? COULEUR_POTENTIEL[p.potentiel] : "#A6791E",
            fillColor: p.potentiel ? COULEUR_POTENTIEL[p.potentiel] : "#A6791E",
            fillOpacity: 0.8,
          }}
        >
          <Popup>
            <strong>{p.nom}</strong>
            <br />
            {p.statut}
            {p.potentiel ? ` · Potentiel ${p.potentiel.toLowerCase()}` : ""}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
