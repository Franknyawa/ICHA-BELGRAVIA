"use client";

import { useEffect, useState } from "react";
import { IconChart, IconPlus, IconTrash } from "@/components/icons";
import ConfirmDialog from "@/components/ConfirmDialog";

type Palier = { id: string; cartonsMin: number; cartonsMax: number | null; prixCarton: string; actif: boolean };

export default function PaliersPrixManager({
  gammeId,
  libelle,
}: {
  gammeId: string;
  libelle: string; // nom court de la gamme, ex. "Belgravia" ou "VDV"
}) {
  const [paliers, setPaliers] = useState<Palier[]>([]);
  const [nouveauMin, setNouveauMin] = useState("");
  const [nouveauMax, setNouveauMax] = useState("");
  const [nouveauPrix, setNouveauPrix] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [palierASupprimer, setPalierASupprimer] = useState<Palier | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  async function charger() {
    const res = await fetch(`/api/paliers-prix?gammeId=${encodeURIComponent(gammeId)}`);
    const data = await res.json();
    setPaliers(data.paliers || []);
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gammeId]);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!nouveauMin || !nouveauPrix) return;
    const res = await fetch("/api/paliers-prix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cartonsMin: parseInt(nouveauMin, 10),
        cartonsMax: nouveauMax ? parseInt(nouveauMax, 10) : null,
        prixCarton: parseFloat(nouveauPrix),
        gammeId,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error || "Erreur lors de la création.");
      return;
    }
    setNouveauMin("");
    setNouveauMax("");
    setNouveauPrix("");
    charger();
  }

  async function modifierChamp(p: Palier, champ: "cartonsMin" | "cartonsMax" | "prixCarton", valeur: string) {
    const body =
      champ === "prixCarton"
        ? { prixCarton: parseFloat(valeur) || 0 }
        : champ === "cartonsMax"
        ? { cartonsMax: valeur === "" ? null : parseInt(valeur, 10) }
        : { cartonsMin: parseInt(valeur, 10) || 0 };
    await fetch(`/api/paliers-prix/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    charger();
  }

  async function toggleActif(p: Palier) {
    await fetch(`/api/paliers-prix/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif: !p.actif }),
    });
    charger();
  }

  async function confirmerSuppression() {
    if (!palierASupprimer) return;
    setSuppressionEnCours(true);
    try {
      await fetch(`/api/paliers-prix/${palierASupprimer.id}`, { method: "DELETE" });
      setPalierASupprimer(null);
      charger();
    } finally {
      setSuppressionEnCours(false);
    }
  }

  return (
    <div className="field-card sm:col-span-2">
      <p className="section-eyebrow mb-1">
        <IconChart className="h-4 w-4" />
        Barème de prix par volume de commande — {libelle}
      </p>
      <p className="mb-3 text-sm text-ink-muted">
        Le prix/carton appliqué aux commandes {libelle} dépend du nombre total de cartons de la
        commande (tous produits de la gamme confondus). Laisser le maximum vide pour un palier
        ouvert ("et plus").
      </p>

      <form onSubmit={ajouter} className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input className="field-input" type="number" placeholder="Cartons min" value={nouveauMin} onChange={(e) => setNouveauMin(e.target.value)} required />
        <input className="field-input" type="number" placeholder="Cartons max (vide = et plus)" value={nouveauMax} onChange={(e) => setNouveauMax(e.target.value)} />
        <input className="field-input" type="number" step="0.01" placeholder="Prix/carton" value={nouveauPrix} onChange={(e) => setNouveauPrix(e.target.value)} required />
        <button className="btn-secondary" type="submit">
          <IconPlus className="h-4 w-4" />
        </button>
      </form>
      {erreur && <p className="mb-2 text-sm text-danger">{erreur}</p>}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-left text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Cartons min</th>
              <th className="px-3 py-2 font-medium">Cartons max</th>
              <th className="px-3 py-2 font-medium">Prix/carton</th>
              <th className="px-3 py-2 font-medium">Statut</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {paliers.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-3 py-2">
                  <input
                    type="number"
                    defaultValue={p.cartonsMin}
                    onBlur={(e) => e.target.value !== String(p.cartonsMin) && modifierChamp(p, "cartonsMin", e.target.value)}
                    className="w-20 rounded-md border border-line bg-bg-elevated px-2 py-1 text-ink"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    placeholder="et plus"
                    defaultValue={p.cartonsMax ?? ""}
                    onBlur={(e) => e.target.value !== String(p.cartonsMax ?? "") && modifierChamp(p, "cartonsMax", e.target.value)}
                    className="w-24 rounded-md border border-line bg-bg-elevated px-2 py-1 text-ink"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={p.prixCarton}
                    onBlur={(e) => e.target.value !== p.prixCarton && modifierChamp(p, "prixCarton", e.target.value)}
                    className="w-28 rounded-md border border-line bg-bg-elevated px-2 py-1 text-ink"
                  />
                </td>
                <td className="px-3 py-2">
                  <span className={p.actif ? "text-ok" : "text-ink-muted"}>{p.actif ? "Actif" : "Désactivé"}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button className="text-xs text-brass hover:underline" onClick={() => toggleActif(p)}>
                      {p.actif ? "Désactiver" : "Réactiver"}
                    </button>
                    <button className="rounded p-1 text-ink-muted hover:text-danger" onClick={() => setPalierASupprimer(p)} title="Supprimer">
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-ink-muted">
                  Aucun palier configuré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!palierASupprimer}
        title="Supprimer ce palier ?"
        message="Cette action est irréversible. Les commandes déjà enregistrées avec ce palier ne sont pas affectées."
        danger
        pending={suppressionEnCours}
        onConfirm={confirmerSuppression}
        onCancel={() => setPalierASupprimer(null)}
      />
    </div>
  );
}
