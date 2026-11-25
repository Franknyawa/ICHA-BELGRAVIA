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
  const [filtreStatut, setFiltreStatut] = useState<"tous" | "actifs" | "desactives">("tous");
  const [recherche, setRecherche] = useState("");
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

  const q = recherche.trim().toLowerCase();
  const produitsAffiches = produits.filter(
    (p) =>
      (!filtreGamme || p.gammeId === filtreGamme) &&
      (filtreStatut === "tous" || (filtreStatut === "actifs" ? p.actif : !p.actif)) &&
      (!q || p.nom.toLowerCase().includes(q))
  );
  const nbActifs = produits.filter((p) => p.actif).length;
  // Regroupement par gamme : une section par gamme (puis « Sans gamme »), produits actifs d'abord.
  const sections = [...gammes.map((g) => ({ cle: g.id, titre: libelleGamme(g), gamme: g as GammeInfo | null })), { cle: "", titre: "Sans gamme", gamme: null as GammeInfo | null }]
    .map((sec) => ({ ...sec, produits: produitsAffiches.filter((p) => (p.gammeId || "") === sec.cle).sort((a, b) => Number(b.actif) - Number(a.actif)) }))
    .filter((sec) => sec.produits.length > 0);

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

  const chip = (actif: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${actif ? "border-brass bg-brass text-white" : "border-line bg-bg-card text-ink hover:border-brass"}`;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconGlass className="h-5 w-5 text-brass" />
          Produits
        </h1>
        <button className="btn-primary" onClick={() => setFormulaireOuvert((v) => !v)}>
          {!formulaireOuvert && <IconPlus className="h-4 w-4" />}
          {formulaireOuvert ? "Annuler" : "Nouveau produit"}
        </button>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-ink-muted">
        Catalogue vendu au terrain. Le commercial choisit uniquement parmi les produits <b className="text-ink">actifs</b> ; il ne peut pas en créer.
        Le prix indiqué est une référence d'affichage : le prix facturé dépend du barème par palier de la gamme (onglet Paramètres).
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { l: "Produits", v: produits.length, c: "text-ink" },
          { l: "Actifs", v: nbActifs, c: "text-ok" },
          { l: "Désactivés", v: produits.length - nbActifs, c: "text-ink-muted" },
          { l: "Gammes", v: gammes.length, c: "text-brass" },
        ].map((k) => (
          <div key={k.l} className="field-card !py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{k.l}</p>
            <p className={`montant mt-0.5 text-2xl ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <GammeTabs gammes={gammes} value={filtreGamme} onChange={setFiltreGamme} />
        <div className="flex gap-2" role="group" aria-label="Statut">
          {([["tous", "Tous"], ["actifs", "Actifs"], ["desactives", "Désactivés"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFiltreStatut(v)} className={chip(filtreStatut === v)}>{l}</button>
          ))}
        </div>
        <input className="field-input !w-56" type="search" placeholder="Rechercher un produit…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher un produit" />
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

      {sections.map((sec) => (
        <section key={sec.cle || "sans"} className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styleBadgeGamme(sec.gamme?.code)}`}>{sec.titre}</span>
            <span className="text-xs font-medium normal-case tracking-normal text-ink-muted">
              {sec.produits.length} produit{sec.produits.length > 1 ? "s" : ""} · {sec.produits.filter((p) => p.actif).length} actif{sec.produits.filter((p) => p.actif).length > 1 ? "s" : ""}
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sec.produits.map((p) => (
              <article key={p.id} className={`field-card relative !p-4 transition ${p.actif ? "" : "bg-bg-elevated/60"}`}>
                <span className={`absolute inset-y-3 left-0 w-1 rounded-r ${p.actif ? "bg-ok" : "bg-line"}`} aria-hidden />
                <div className="flex items-start justify-between gap-3">
                  <input
                    defaultValue={p.nom}
                    title={p.nom}
                    aria-label="Nom du produit"
                    onBlur={(e) => e.target.value !== p.nom && modifierChamp(p, "nom", e.target.value)}
                    className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-base font-bold hover:border-line focus:border-brass focus:outline-none ${p.actif ? "text-ink" : "text-ink-muted"}`}
                  />
                  <button className="shrink-0 rounded p-1 text-ink-muted hover:text-danger" onClick={() => setProduitASupprimer(p)} title="Supprimer" aria-label={`Supprimer ${p.nom}`}>
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-muted">Volume</span>
                    <span className="flex items-center gap-1.5">
                      <input
                        type="number"
                        defaultValue={p.volumeMl}
                        onBlur={(e) => e.target.value !== String(p.volumeMl) && modifierChamp(p, "volumeMl", e.target.value)}
                        className="field-input !min-w-0 !w-full"
                      />
                      <span className="text-sm text-ink-muted">ml</span>
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-muted">Prix de référence</span>
                    <span className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={p.prixUnitaire}
                        onBlur={(e) => e.target.value !== p.prixUnitaire && modifierChamp(p, "prixUnitaire", e.target.value)}
                        className="field-input !min-w-0 !w-full"
                      />
                      <span className="text-sm text-ink-muted">F</span>
                    </span>
                  </label>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
                  <select
                    value={p.gammeId || ""}
                    aria-label="Gamme"
                    onChange={(e) => {
                      fetch(`/api/produits/${p.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ gammeId: e.target.value || null }),
                      }).then(charger);
                    }}
                    className={`!w-auto !min-w-0 rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold ${styleBadgeGamme(p.gamme?.code)}`}
                  >
                    <option value="">Sans gamme</option>
                    {gammes.map((g) => (
                      <option key={g.id} value={g.id}>{libelleGamme(g)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={p.actif}
                    onClick={() => toggleActif(p)}
                    className="flex items-center gap-2 text-sm font-semibold"
                    title={p.actif ? "Désactiver ce produit" : "Réactiver ce produit"}
                  >
                    <span className={p.actif ? "text-ok" : "text-ink-muted"}>{p.actif ? "Actif" : "Désactivé"}</span>
                    <span className={`relative h-6 w-11 rounded-full transition-colors ${p.actif ? "bg-ok" : "bg-line"}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${p.actif ? "left-[1.375rem]" : "left-0.5"}`} />
                    </span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {sections.length === 0 && (
        <p className="field-card py-10 text-center text-ink-muted">Aucun produit ne correspond à ces filtres.</p>
      )}

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
