"use client";

import { useEffect, useState } from "react";
import { IconGlass, IconPlus, IconTrash } from "@/components/icons";

type Produit = { id: string; nom: string; prixUnitaire: string; actif: boolean };

export default function ProduitsPage() {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [prix, setPrix] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    const res = await fetch("/api/produits");
    const data = await res.json();
    setProduits(data.produits || []);
  }

  useEffect(() => {
    charger();
  }, []);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const res = await fetch("/api/produits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, prixUnitaire: parseFloat(prix) || 0 }),
    });
    setEnCours(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error || "Erreur lors de la création.");
      return;
    }
    setNom("");
    setPrix("");
    setFormulaireOuvert(false);
    charger();
  }

  async function modifierChamp(p: Produit, champ: "nom" | "prixUnitaire", valeur: string) {
    const body = champ === "prixUnitaire" ? { prixUnitaire: parseFloat(valeur) || 0 } : { nom: valeur };
    await fetch(`/api/produits/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    charger();
  }

  async function toggleActif(p: Produit) {
    await fetch(`/api/produits/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif: !p.actif }),
    });
    charger();
  }

  async function supprimer(p: Produit) {
    if (!confirm(`Supprimer "${p.nom}" ?`)) return;
    const res = await fetch(`/api/produits/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Échec de la suppression.");
      return;
    }
    charger();
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconGlass className="h-5 w-5 text-brass" />
          Produits
        </h1>
        <button className="btn-primary" onClick={() => setFormulaireOuvert((v) => !v)}>
          {!formulaireOuvert && <IconPlus className="h-4 w-4" />}
          {formulaireOuvert ? "Annuler" : "Nouveau produit"}
        </button>
      </div>

      {formulaireOuvert && (
        <form onSubmit={creer} className="field-card mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
          <input className="field-input" placeholder="Nom du produit" value={nom} onChange={(e) => setNom(e.target.value)} required />
          <input className="field-input" type="number" step="0.01" placeholder="Prix" value={prix} onChange={(e) => setPrix(e.target.value)} required />
          {erreur && <p className="col-span-full text-sm text-danger">{erreur}</p>}
          <button className="btn-primary col-span-full" disabled={enCours}>
            {enCours ? "Création…" : "Créer le produit"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-left text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Produit</th>
              <th className="px-4 py-3 font-medium">Prix unitaire</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {produits.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <input
                    defaultValue={p.nom}
                    onBlur={(e) => e.target.value !== p.nom && modifierChamp(p, "nom", e.target.value)}
                    className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-ink hover:border-line focus:border-brass focus:outline-none"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={p.prixUnitaire}
                    onBlur={(e) => e.target.value !== p.prixUnitaire && modifierChamp(p, "prixUnitaire", e.target.value)}
                    className="w-28 rounded-md border border-line bg-bg-elevated px-2 py-1 text-ink"
                  />
                </td>
                <td className="px-4 py-3">
                  <span className={p.actif ? "text-ok" : "text-ink-muted"}>{p.actif ? "Actif" : "Désactivé"}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button className="text-xs text-brass hover:underline" onClick={() => toggleActif(p)}>
                      {p.actif ? "Désactiver" : "Réactiver"}
                    </button>
                    <button className="rounded p-1 text-ink-muted hover:text-danger" onClick={() => supprimer(p)} title="Supprimer">
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
