"use client";

import { useEffect, useState } from "react";
import { IconGlass, IconPlus } from "@/components/icons";

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

  async function modifierPrix(p: Produit, nouveauPrix: string) {
    await fetch(`/api/produits/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prixUnitaire: parseFloat(nouveauPrix) || 0 }),
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

      <div className="overflow-hidden rounded-lg border border-line">
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
                <td className="px-4 py-3 text-ink">{p.nom}</td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={p.prixUnitaire}
                    onBlur={(e) => e.target.value !== p.prixUnitaire && modifierPrix(p, e.target.value)}
                    className="w-28 rounded-md border border-line bg-bg-elevated px-2 py-1 text-ink"
                  />
                </td>
                <td className="px-4 py-3">
                  <span className={p.actif ? "text-ok" : "text-ink-muted"}>{p.actif ? "Actif" : "Désactivé"}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs text-brass hover:underline" onClick={() => toggleActif(p)}>
                    {p.actif ? "Désactiver" : "Réactiver"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
