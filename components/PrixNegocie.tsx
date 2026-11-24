"use client";

import { nombreFr } from "@/lib/format";

/**
 * Prix du carton négocié avec le client — à renseigner AVANT les quantités. Vide : tarif général (barème par palier).
 * Renseigné : ce prix s'applique à tous les cartons de la commande, quel que soit le volume.
 * « Enregistrer pour ce client » le mémorise : il sera proposé d'office à ses prochaines commandes.
 */
export type EtatPrix = { prix: string; memoriser: boolean };
export const PRIX_VIDE: EtatPrix = { prix: "", memoriser: false };

/** Corps à joindre à la commande selon la saisie (`memo` = prix déjà enregistré sur la fiche du client). */
export function champsPrix(etat: EtatPrix, memo: number | null, estDivers: boolean) {
  const prix = Math.round(Number(etat.prix.replace(/\s/g, "").replace(",", ".")) || 0);
  if (prix > 0) return { prixCartonNegocie: prix, ...(etat.memoriser && !estDivers ? { memoriserPrix: true } : {}) };
  // Champ vidé alors qu'un prix était enregistré : tarif général (et on oublie le prix enregistré si demandé).
  if (memo) return { prixCartonNegocie: 0, ...(etat.memoriser ? { memoriserPrix: true } : {}) };
  return {};
}

export default function PrixNegocie({
  etat,
  onChange,
  memo,
  prixBase,
  estDivers,
  gamme,
}: {
  etat: EtatPrix;
  onChange: (e: EtatPrix) => void;
  memo: number | null;
  prixBase: number;
  estDivers: boolean;
  gamme: string;
}) {
  const prix = Math.round(Number(etat.prix.replace(/\s/g, "").replace(",", ".")) || 0);
  const modifie = prix > 0 && prix !== memo;
  return (
    <div className="rounded-lg border border-line bg-bg-elevated p-3.5">
      <p className="text-sm font-extrabold text-ink">Prix négocié avec ce client <span className="font-medium text-ink-muted">(facultatif)</span></p>
      <p className="mt-0.5 text-xs font-medium text-ink-muted">
        À renseigner avant les quantités. Il remplace le barème pour toute la commande{gamme ? ` (${gamme})` : ""}.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          inputMode="numeric"
          className="field-input !w-44"
          placeholder="Tarif général"
          value={etat.prix}
          onChange={(e) => onChange({ ...etat, prix: e.target.value.replace(/[^\d\s]/g, "") })}
          aria-label="Prix négocié du carton en FCFA"
        />
        <span className="text-xs font-bold text-ink-muted">FCFA / carton</span>
        {etat.prix && (
          <button type="button" className="text-xs font-bold text-brass hover:underline" onClick={() => onChange({ ...etat, prix: "" })}>
            Tarif général
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs font-medium text-ink-muted">
        {prixBase > 0 ? <>Prix de base : <span className="montant font-bold">{nombreFr(prixBase)}</span> FCFA. </> : null}
        {memo ? <>Prix enregistré pour ce client : <span className="montant font-bold text-ink">{nombreFr(memo)}</span> FCFA.</> : null}
      </p>
      {!estDivers && (modifie || (memo && !prix)) && (
        <label className="mt-2 flex items-center gap-2 text-xs font-bold text-ink">
          <input type="checkbox" checked={etat.memoriser} onChange={(e) => onChange({ ...etat, memoriser: e.target.checked })} />
          {prix > 0 ? "Enregistrer ce prix pour ce client (prochaines commandes)" : "Supprimer le prix enregistré de ce client"}
        </label>
      )}
      {estDivers && <p className="mt-2 text-xs text-ink-muted">Client divers : le prix n'est valable que pour cette commande.</p>}
    </div>
  );
}
