"use client";

import { useEffect, useMemo, useState } from "react";
import { IconClose, IconAlert } from "@/components/icons";
import { nombreFr } from "@/lib/format";
import type { FactureVente } from "@/lib/facturationPdf";

export type FactureEmettable = Omit<FactureVente, "lignes"> & {
  lignes: { id: string; libelle: string; quantite: number; prixUnitaire: number; sousTotal: number; restant: number }[];
};

type Resultat = { numero: string; type: "FR" | "FA"; montant: number; remboursement: number };

export default function ModaleAvoirRetour({
  facture,
  onFermer,
  onEmis,
}: {
  facture: FactureEmettable;
  onFermer: () => void;
  onEmis: (r: Resultat) => void;
}) {
  const [type, setType] = useState<"FR" | "FA">("FR");
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [libre, setLibre] = useState("");
  const [canal, setCanal] = useState("ESPECES");
  const [destination, setDestination] = useState<"STOCK" | "AVARIES">("STOCK");
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const surEchap = (e: KeyboardEvent) => e.key === "Escape" && !envoi && onFermer();
    window.addEventListener("keydown", surEchap);
    return () => window.removeEventListener("keydown", surEchap);
  }, [onFermer, envoi]);

  const montantLignes = facture.lignes.reduce((s, l) => s + (quantites[l.id] || 0) * l.prixUnitaire, 0);
  const montantLibre = Math.round(Number(libre.replace(/\s/g, "")) || 0);
  const nbCartons = Object.values(quantites).reduce((s, q) => s + q, 0);
  const montant = type === "FR" ? montantLignes : nbCartons > 0 ? montantLignes : montantLibre;
  const netApres = facture.net - montant;
  const remboursement = Math.max(0, facture.encaisse - netApres);
  const depasse = montant > facture.net;
  const peutEmettre = montant > 0 && !depasse && motif.trim().length >= 3 && !envoi;

  const lignesActives = useMemo(() => facture.lignes.filter((l) => l.restant > 0), [facture.lignes]);

  function changer(id: string, delta: number, max: number) {
    setQuantites((q) => {
      const n = Math.max(0, Math.min(max, (q[id] || 0) + delta));
      const { [id]: _, ...reste } = q;
      return n === 0 ? reste : { ...reste, [id]: n };
    });
  }

  async function emettre() {
    setErreur(null);
    setEnvoi(true);
    try {
      const res = await fetch("/api/documents-correctifs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          commandeId: facture.id,
          lignes: Object.entries(quantites).map(([ligneId, quantite]) => ({ ligneId, quantite })),
          montantLibre: type === "FA" && nbCartons === 0 ? montantLibre : 0,
          motif: motif.trim(),
          destination: type === "FR" ? destination : undefined,
          canal: remboursement > 0 ? canal : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setErreur(j.error || "Émission impossible.");
      onEmis(j);
    } catch {
      setErreur("Connexion impossible. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Avoir / Retour"
      onMouseDown={(e) => e.target === e.currentTarget && !envoi && onFermer()}
    >
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-line bg-bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-brass">Avoir / Retour</p>
            <h2 className="truncate font-menu text-lg font-extrabold text-ink">{facture.pointVente.nomEtablissement}</h2>
            <p className="text-xs font-medium text-ink-muted">
              {facture.numeroFV} · <span className="montant">{nombreFr(facture.net)}</span> FCFA restant à créditer
            </p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="rounded-md p-2 text-ink-muted hover:bg-bg-elevated hover:text-ink">
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Type de document">
            {(
              [
                ["FR", "Facture retour", "Cartons rendus par le client"],
                ["FA", "Facture d'avoir", "Remise, erreur de prix ou geste commercial"],
              ] as const
            ).map(([v, titre, aide]) => (
              <button key={v} type="button" onClick={() => setType(v)} className={`choice-pill text-left ${type === v ? "choice-pill-active" : ""}`} aria-pressed={type === v}>
                <span className="block font-bold">{titre} ({v})</span>
                <span className="mt-0.5 block text-xs font-medium text-ink-muted">{aide}</span>
              </button>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
              {type === "FR" ? "Cartons retournés" : "Cartons concernés (facultatif)"}
            </p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {lignesActives.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{l.libelle}</p>
                    <p className="text-xs font-medium text-ink-muted">
                      max {l.restant} · <span className="montant">{nombreFr(l.prixUnitaire)}</span> FCFA / carton
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" className="btn-secondary !px-3" aria-label={`Moins de ${l.libelle}`} disabled={!quantites[l.id]} onClick={() => changer(l.id, -1, l.restant)}>
                      −
                    </button>
                    <span className="montant w-8 text-center text-base font-bold">{quantites[l.id] || 0}</span>
                    <button type="button" className="btn-secondary !px-3" aria-label={`Plus de ${l.libelle}`} disabled={(quantites[l.id] || 0) >= l.restant} onClick={() => changer(l.id, 1, l.restant)}>
                      +
                    </button>
                  </div>
                </li>
              ))}
              {lignesActives.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">Tous les cartons de cette facture sont déjà couverts.</li>}
            </ul>
          </div>

          {type === "FA" && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-muted" htmlFor="avoir-libre">
                Ou montant libre à créditer (FCFA)
              </label>
              <input
                id="avoir-libre"
                inputMode="numeric"
                className="field-input"
                placeholder="0"
                value={libre}
                disabled={nbCartons > 0}
                onChange={(e) => setLibre(e.target.value.replace(/[^\d\s]/g, ""))}
              />
              {nbCartons > 0 && <p className="mt-1 text-xs text-ink-muted">Le montant est calculé d'après les cartons choisis.</p>}
            </div>
          )}

          {type === "FR" && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-muted" htmlFor="retour-dest">
                Destination des cartons
              </label>
              <select id="retour-dest" className="field-input" value={destination} onChange={(e) => setDestination(e.target.value as "STOCK" | "AVARIES")}>
                <option value="STOCK">Retour en stock vendable</option>
                <option value="AVARIES">Avaries (non revendable)</option>
              </select>
            </div>
          )}

          {remboursement > 0 && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-muted" htmlFor="avoir-canal">
                Remboursement du client — canal
              </label>
              <select id="avoir-canal" className="field-input" value={canal} onChange={(e) => setCanal(e.target.value)}>
                <option value="ESPECES">Espèces</option>
                <option value="OM_MOMO">OM/MOMO</option>
                <option value="BANQUE">Banque</option>
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                Le client a déjà payé : <span className="montant font-bold">{nombreFr(remboursement)}</span> FCFA seront sortis de la caisse.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-muted" htmlFor="avoir-motif">
              Motif
            </label>
            <textarea id="avoir-motif" rows={2} className="field-input" placeholder="Ex. cartons endommagés à la livraison" value={motif} onChange={(e) => setMotif(e.target.value)} />
          </div>

          <div className="rounded-lg bg-bg-elevated px-4 py-3 text-sm">
            <div className="flex justify-between font-medium text-ink-muted">
              <span>{type === "FR" ? "Valeur des retours" : "Montant de l'avoir"}</span>
              <span className="montant font-bold text-ink">{nombreFr(montant)} FCFA</span>
            </div>
            <div className="mt-1 flex justify-between font-medium text-ink-muted">
              <span>Net de la facture après émission</span>
              <span className="montant font-bold text-ink">{nombreFr(Math.max(0, netApres))} FCFA</span>
            </div>
          </div>

          {(depasse || erreur) && (
            <p className="flex items-start gap-2 text-sm font-bold text-danger" role="alert">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {erreur || `Montant supérieur au restant créditable (${nombreFr(facture.net)} FCFA).`}
            </p>
          )}
          <p className="text-xs text-ink-muted">Un document émis est définitif : il ne peut ni être modifié ni supprimé.</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" className="btn-secondary" onClick={onFermer} disabled={envoi}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={emettre} disabled={!peutEmettre}>
            {envoi ? "Émission…" : type === "FR" ? "Émettre la facture retour" : "Émettre la facture d'avoir"}
          </button>
        </div>
      </div>
    </div>
  );
}
