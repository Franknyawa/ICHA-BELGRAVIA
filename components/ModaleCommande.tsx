"use client";

import { arrondirDemi, formaterCartons } from "@/lib/quantites";
import QuantiteCartons from "@/components/QuantiteCartons";
import { nombreFr } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";
import { IconClose, IconPlus, IconAlert } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { trouverPrixCarton, type PalierPrix } from "@/lib/pricing";

type Donnees = {
  commande: {
    id: string;
    statut: string;
    montantRecu: string;
    modePaiement: string;
    operateurMobile: string | null;
    observations: string | null;
    dateLivraison: string | null;
    lignes: { produitId: string | null; quantite: number; produit: { nom: string } | null }[];
  };
  produits: { id: string; nom: string }[];
  paliers: PalierPrix[];
  verrouille: boolean;
};

const fcfa = nombreFr;

/**
 * Fenêtre « Modifier la commande » (ADMIN / SUPER_ADMIN). Le prix est toujours
 * recalculé par le serveur selon le barème de la gamme ; l'aperçu ici n'est qu'indicatif.
 */
export default function ModaleCommande({ commandeId, nom, onFermer, onEnregistre }: { commandeId: string; nom: string; onFermer: () => void; onEnregistre: () => void }) {
  const [d, setD] = useState<Donnees | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [ajout, setAjout] = useState("");
  const [mode, setMode] = useState("ESPECES");
  const [operateur, setOperateur] = useState("ORANGE_MONEY");
  const [recu, setRecu] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/commandes/${commandeId}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Chargement impossible.");
        return j as Donnees;
      })
      .then((j) => {
        if (annule) return;
        setD(j);
        const q: Record<string, number> = {};
        for (const l of j.commande.lignes) if (l.produitId) q[l.produitId] = (q[l.produitId] || 0) + l.quantite;
        setQuantites(q);
        setMode(j.commande.modePaiement);
        setOperateur(j.commande.operateurMobile || "ORANGE_MONEY");
        setRecu(String(Math.round(Number(j.commande.montantRecu) || 0)));
        setDate(j.commande.dateLivraison ? j.commande.dateLivraison.slice(0, 10) : "");
        setNote(j.commande.observations || "");
      })
      .catch((e) => !annule && setErreurChargement(e.message));
    return () => {
      annule = true;
    };
  }, [commandeId]);

  useEffect(() => {
    const surEchap = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", surEchap);
    return () => window.removeEventListener("keydown", surEchap);
  }, [onFermer]);

  const nomProduit = (id: string) => d?.produits.find((p) => p.id === id)?.nom || d?.commande.lignes.find((l) => l.produitId === id)?.produit?.nom || "Produit";
  const ids = Object.keys(quantites);
  const totalCartons = ids.reduce((s, id) => s + quantites[id], 0);
  const prixCarton = useMemo(() => (d && totalCartons > 0 ? trouverPrixCarton(totalCartons, d.paliers) : 0), [d, totalCartons]);
  const disponibles = d?.produits.filter((p) => !(p.id in quantites)) ?? [];

  function fixer(id: string, n: number) {
    setQuantites((q) => {
      const { [id]: _, ...reste } = q;
      return n <= 0 ? reste : { ...reste, [id]: Math.min(arrondirDemi(n), 100000) };
    });
  }
  function changer(id: string, delta: number) {
    setQuantites((q) => {
      const n = (q[id] || 0) + delta;
      const { [id]: _, ...reste } = q;
      return n <= 0 ? reste : { ...reste, [id]: n };
    });
  }

  async function enregistrer() {
    setErreur(null);
    if (ids.length === 0) return setErreur("Ajoutez au moins un produit.");
    setEnvoi(true);
    try {
      const res = await fetch(`/api/commandes/${commandeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "MODIFIER",
          lignes: ids.map((id) => ({ produitId: id, quantite: quantites[id] })),
          modePaiement: mode,
          operateurMobile: mode === "MOBILE_MONEY" ? operateur : undefined,
          montantRecu: mode === "CREDIT_PARTIEL" ? Number(recu) || 0 : undefined,
          dateLivraison: date,
          observations: note,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setErreur(j.error || "Enregistrement impossible.");
      onEnregistre();
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Modifier la commande" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-line bg-bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-brass">Modifier la commande</p>
            <h2 className="truncate font-menu text-lg font-extrabold text-ink">{nom}</h2>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="rounded-md p-2 text-ink-muted hover:bg-bg-elevated hover:text-ink">
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {!d && !erreurChargement && (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6" />
            </div>
          )}
          {erreurChargement && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erreurChargement}</p>}

          {d && (
            <>
              {d.verrouille && (
                <p className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
                  <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                  Des encaissements existent en caisse pour cette commande : annulez-les d'abord dans la Caisse pour pouvoir la modifier.
                </p>
              )}

              <section>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-muted">Produits (cartons)</p>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {ids.map((id) => (
                    <li key={id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="min-w-0 truncate font-semibold text-ink">{nomProduit(id)}</span>
                      <QuantiteCartons valeur={quantites[id]} onChange={(n) => fixer(id, n)} libelle={nomProduit(id)} compact />
                    </li>
                  ))}
                  {ids.length === 0 && <li className="px-3 py-4 text-center text-sm text-ink-muted">Aucun produit.</li>}
                </ul>
                {disponibles.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    <select className="field-input flex-1" value={ajout} onChange={(e) => setAjout(e.target.value)}>
                      <option value="">Ajouter un produit…</option>
                      {disponibles.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                    </select>
                    <button type="button" className="btn-secondary" disabled={!ajout} onClick={() => { setQuantites((q) => ({ ...q, [ajout]: 1 })); setAjout(""); }}>
                      <IconPlus className="h-4 w-4" />
                      Ajouter
                    </button>
                  </div>
                )}
              </section>

              <section className="grid gap-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-ink-muted">Paiement</p>
                <select className="field-input" value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="ESPECES">Espèces</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="CREDIT_PARTIEL">Crédit partiel</option>
                  <option value="CREDIT_TOTAL">Crédit total</option>
                </select>
                {mode === "MOBILE_MONEY" && (
                  <div className="grid grid-cols-2 gap-1">
                    {[["ORANGE_MONEY", "Orange Money"], ["MTN_MOMO", "MTN MoMo"]].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setOperateur(v)} className={`rounded-md border px-2 py-2 text-sm font-semibold ${operateur === v ? "border-brass bg-brass text-white" : "border-line text-ink-muted hover:border-brass"}`}>{l}</button>
                    ))}
                  </div>
                )}
                {mode === "CREDIT_PARTIEL" && (
                  <input className="field-input" inputMode="numeric" placeholder="Montant déjà reçu (FCFA)" value={recu} onChange={(e) => setRecu(e.target.value.replace(/\D/g, ""))} />
                )}
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  Livraison prévue
                  <input type="date" className="field-input max-w-[170px]" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <textarea className="field-input" rows={2} maxLength={500} placeholder="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} />
              </section>

              <section className="rounded-xl border border-brass/30 bg-brass/5 px-4 py-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-ink-muted">Nouveau total (aperçu)</p>
                    <p className="text-xs text-ink-muted">{formaterCartons(totalCartons)} carton{totalCartons > 1 ? "s" : ""} × {fcfa(prixCarton)} FCFA</p>
                  </div>
                  <p className="montant text-3xl text-ink">{fcfa(totalCartons * prixCarton)}<span className="montant-unite">FCFA</span></p>
                </div>
                <p className="mt-1 text-[11px] text-ink-muted">Le prix par carton dépend du volume total : il est recalculé par le serveur à l'enregistrement. Le stock est ajusté automatiquement.</p>
              </section>
            </>
          )}
        </div>

        <div className="border-t border-line px-5 py-3">
          {erreur && <p className="mb-2 text-sm font-medium text-danger">{erreur}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={onFermer}>Annuler</button>
            <button type="button" className="btn-primary flex-1" disabled={!d || d.verrouille || envoi} onClick={enregistrer}>
              {envoi ? <Spinner className="h-4 w-4" /> : "Enregistrer les modifications"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
