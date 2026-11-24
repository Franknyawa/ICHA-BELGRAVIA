"use client";

import QuantiteCartons from "@/components/QuantiteCartons";
import { formaterCartons } from "@/lib/quantites";

type ProduitEch = { id: string; nom: string; gammeId: string | null };

/** Échantillons offerts avec la commande : retirés du stock, jamais facturés. */
export default function EchantillonsSection({
  produits,
  gammeLibelle,
  quantites,
  onChange,
}: {
  produits: ProduitEch[];
  gammeLibelle: (gammeId: string | null) => string;
  quantites: Record<string, number>;
  onChange: (produitId: string, q: number) => void;
}) {
  const total = Object.values(quantites).reduce((s, q) => s + q, 0);
  return (
    <div className="field-card space-y-3">
      <p className="section-eyebrow">Échantillons</p>
      <div className="divide-y divide-line rounded-lg border border-line">
        {produits.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{p.nom}</p>
              {gammeLibelle(p.gammeId) && <p className="text-xs font-medium text-ink-muted">{gammeLibelle(p.gammeId)}</p>}
            </div>
            <QuantiteCartons valeur={quantites[p.id] || 0} onChange={(q) => onChange(p.id, q)} libelle={`échantillon ${p.nom}`} compact />
          </div>
        ))}
        {produits.length === 0 && <p className="px-3 py-3 text-sm text-ink-muted">Chargement du catalogue…</p>}
        <div className="flex items-center justify-between bg-bg-elevated px-3 py-2 text-sm">
          <span className="font-bold text-ink-muted">Total échantillons</span>
          <span className="montant font-bold text-ink">{formaterCartons(total)} carton{total > 1 ? "s" : ""}</span>
        </div>
      </div>
      <p className="text-xs font-medium text-ink-muted">Retirés du stock, jamais facturés.</p>
    </div>
  );
}
