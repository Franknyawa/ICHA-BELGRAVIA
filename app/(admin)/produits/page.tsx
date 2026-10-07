"use client";

import { useEffect, useState } from "react";
import { IconGlass, IconPlus, IconTrash } from "@/components/icons";
import ConfirmDialog from "@/components/ConfirmDialog";
import GammeTabs from "@/components/GammeTabs";
import { libelleGamme, styleBadgeGamme, type GammeInfo } from "@/lib/gammesClient";
import { Spinner, ChargementPage } from "@/components/Spinner";

type Produit = {
  id: string;
  nom: string;
  volumeMl: number;
  prixUnitaire: string;
  actif: boolean;
  gammeId: string | null;
  gamme: GammeInfo | null;
};

export default function ProduitsPage() {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [gammes, setGammes] = useState<GammeInfo[]>([]);
  const [filtreGamme, setFiltreGamme] = useState("");
  const [gammeId, setGammeId] = useState("");
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [volumeMl, setVolumeMl] = useState("275");
  const [prix, setPrix] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [produitASupprimer, setProduitASupprimer] = useState<Produit | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null);

  async function charger() {
    const res = await fetch("/api/produits");
    const data = await res.json();
    setProduits(data.produits || []);
  }

  useEffect(() => {
    charger();
    fetch("/api/gammes")
      .then((r) => r.json())
      .then((d) => {
        setGammes(d.gammes || []);
        if (d.gammes?.length) setGammeId(d.gammes[0].id);
      });
  }, []);

  const produitsAffiches = filtreGamme ? produits.filter((p) => p.gammeId === filtreGamme) : produits;

  // Volume par défaut selon la gamme choisie : 275 ml pour les canettes RTD,
  // 750 ml pour les bouteilles de vin mousseux.
  function changerGammeCreation(id: string) {
    setGammeId(id);
    const g = gammes.find((x) => x.id === id);
    setVolumeMl(g?.code === "VDV" ? "750" : "275");
  }

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const res = await fetch("/api/produits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, gammeId, volumeMl: parseInt(volumeMl, 10) || 275, prixUnitaire: parseFloat(prix) || 0 }),
    });
    setEnCours(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error || "Erreur lors de la création.");
      return;
    }
    setNom("");
    setVolumeMl(gammes.find((x) => x.id === gammeId)?.code === "VDV" ? "750" : "275");
    setPrix("");
    setFormulaireOuvert(false);
    charger();
  }

  async function modifierChamp(p: Produit, champ: "nom" | "prixUnitaire" | "volumeMl", valeur: string) {
    const body =
      champ === "nom"
        ? { nom: valeur }
        : champ === "volumeMl"
        ? { volumeMl: parseInt(valeur, 10) || p.volumeMl }
        : { prixUnitaire: parseFloat(valeur) || 0 };
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

  async function confirmerSuppression() {
    if (!produitASupprimer) return;
    setSuppressionEnCours(true);
    setErreurSuppression(null);
    try {
      const res = await fetch(`/api/produits/${produitASupprimer.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErreurSuppression(data.error || "Échec de la suppression.");
        return;
      }
      setProduitASupprimer(null);
      charger();
    } finally {
      setSuppressionEnCours(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconGlass className="h-5 w-5 text-brass" />
          Produits
        </h1>
        <button className="btn-primary" onClick={() => setFormulaireOuvert((v) => !v)}>
          {!formulaireOuvert && <IconPlus className="h-4 w-4" />}
          {formulaireOuvert ? "Annuler" : "Nouveau produit"}
        </button>
      </div>
      <p className="mb-4 text-sm text-ink-muted">
        Catalogue vendu au terrain, par gamme (Belgravia, VDV) — le commercial choisit uniquement parmi les produits
        actifs ici, il ne peut pas en créer. Le prix indiqué est une référence d'affichage ; le prix réellement
        facturé dépend du barème par palier de cartons de la gamme (onglet Paramètres).
      </p>

      <div className="mb-5">
        <GammeTabs gammes={gammes} value={filtreGamme} onChange={setFiltreGamme} />
      </div>

      {formulaireOuvert && (
        <form onSubmit={creer} className="field-card mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_100px_120px]">
          <div className="col-span-full">
            <label className="field-label">Gamme</label>
            <GammeTabs gammes={gammes} value={gammeId} onChange={changerGammeCreation} avecToutes={false} />
          </div>
          <input className="field-input" placeholder="Nom du produit" value={nom} onChange={(e) => setNom(e.target.value)} required />
          <input className="field-input" type="number" placeholder="Volume (ml)" value={volumeMl} onChange={(e) => setVolumeMl(e.target.value)} required />
          <input className="field-input" type="number" step="0.01" placeholder="Prix de référence" value={prix} onChange={(e) => setPrix(e.target.value)} required />
          {erreur && <p className="col-span-full text-sm text-danger">{erreur}</p>}
          <button className="btn-primary col-span-full" disabled={enCours}>
            {enCours && <Spinner className="h-4 w-4" />}
            {enCours ? "Création…" : "Créer le produit"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-left text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Produit</th>
              <th className="px-4 py-3 font-medium">Gamme</th>
              <th className="px-4 py-3 font-medium">Volume</th>
              <th className="px-4 py-3 font-medium">Prix de référence</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {produitsAffiches.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <input
                    defaultValue={p.nom}
                    onBlur={(e) => e.target.value !== p.nom && modifierChamp(p, "nom", e.target.value)}
                    className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-ink hover:border-line focus:border-brass focus:outline-none"
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={p.gammeId || ""}
                    onChange={(e) => {
                      fetch(`/api/produits/${p.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ gammeId: e.target.value || null }),
                      }).then(charger);
                    }}
                    className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold ${styleBadgeGamme(p.gamme?.code)}`}
                  >
                    <option value="">Sans gamme</option>
                    {gammes.map((g) => (
                      <option key={g.id} value={g.id}>{libelleGamme(g)}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      defaultValue={p.volumeMl}
                      onBlur={(e) => e.target.value !== String(p.volumeMl) && modifierChamp(p, "volumeMl", e.target.value)}
                      className="w-16 rounded-md border border-line bg-bg-elevated px-2 py-1 text-ink"
                    />
                    <span className="text-ink-muted">ml</span>
                  </div>
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
                    <button
                      className="rounded p-1 text-ink-muted hover:text-danger"
                      onClick={() => setProduitASupprimer(p)}
                      title="Supprimer"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {produitsAffiches.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                  Aucun produit dans cette gamme pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!produitASupprimer}
        title="Supprimer ce produit ?"
        message={
          erreurSuppression ||
          `Supprimer "${produitASupprimer?.nom}" ? Si ce produit figure déjà dans des commandes, désactive-le plutôt.`
        }
        danger
        pending={suppressionEnCours}
        confirmLabel="Supprimer"
        onConfirm={confirmerSuppression}
        onCancel={() => {
          setProduitASupprimer(null);
          setErreurSuppression(null);
        }}
      />
    </div>
  );
}
