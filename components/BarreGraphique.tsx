"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

type Item = { label: string; valeur: number };

const COULEURS = ["#A6791E", "#4C7A4F", "#B9791E", "#8F4416", "#7A9B8E", "#A33B2E"];

export default function BarreGraphique({
  titre,
  data,
  formatValeur,
}: {
  titre: string;
  data: Item[];
  formatValeur?: (n: number) => string;
}) {
  const format = formatValeur || ((n: number) => String(n));
  return (
    <div className="field-card">
      <p className="mb-3 text-sm font-semibold text-ink">{titre}</p>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">Aucune donnée pour le moment.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "rgb(var(--color-ink-muted))" }}
              interval={0}
              angle={data.length > 4 ? -25 : 0}
              textAnchor={data.length > 4 ? "end" : "middle"}
              height={data.length > 4 ? 55 : 30}
            />
            <YAxis tick={{ fontSize: 11, fill: "rgb(var(--color-ink-muted))" }} allowDecimals={false} />
            <Tooltip
              formatter={(value: number) => [format(value), ""]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid rgb(var(--color-line))",
                background: "rgb(var(--color-bg-elevated))",
                fontSize: 12,
              }}
            />
            <Bar dataKey="valeur" radius={[6, 6, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COULEURS[i % COULEURS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
