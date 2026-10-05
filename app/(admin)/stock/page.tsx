"use client";

import { useEffect, useState } from "react";
import { IconList, IconAlert, IconPlus, IconCheckCircle, IconGlass } from "@/components/icons";
import GammeTabs from "@/components/GammeTabs";
import { styleBadgeGamme, libelleGamme, type GammeInfo } from "@/lib/gammesClient";

type StockItem = {
  produitId: string;
  nom: string;
  volumeMl: number;
  gammeId: string | null;
  gammeCode: string | null;
  quantiteCartons: number;
  seuilAlerte: number;
  enAlerte: boolean;
};
type Mouvement = {
  id: string;
  type: string;
  quantiteCartons: number;
  referenceType: string | null;
  note: string | null;
  createdAt: string;
  produit: { nom: string };
};

const TYPE_LABEL: Record<string, string> = { ENTREE: "Entrée", SORTIE: "Sortie", AJUSTEMENT: "Ajustement" };
const TYPE_STYLE: Record<string, string> = { ENTREE: "text-ok", SORTIE: "text-ink-muted", AJUSTEMENT: "text-brass" };

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [gammes, setGammes] = useState<GammeInfo[]>([]);
  const [filtreGamme, setFiltreGamme] = useState("");
  const [produitId, setProduitId] = useState("");
  const [type, setType] = useState<"ENTREE" | "AJUSTEMENT">("ENTREE");
  const [quantite, setQuantite] = useState("");
  const [note, setNote] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function chargerStock() {
    const res = await fetch("/api/stock");
    const data = await res.json();
    setItems(data.items || []);
  }
  async function chargerMouvements() {
    const res = await fetch("/api/stock/mouvements");
    const data = await res.json();
    setMouvements(data.items || []);
  }

  async function chargerTout() {
    setChargement(true);
    await Promise.all([chargerStock(), chargerMouvements()]);
    setChargement(false);
  }

  useEffect(() => {
    chargerTout();
    fetch("/api/gammes").then((r) => r.json()).then((d) => setGammes(d.gammes || []));
  }, []);

  async function enregistrerMouvement(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!produitId || !quantite) return;
    setEnCours(true);
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produitId, type, quantiteCartons: parseInt(quantite, 10), note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErreur(data.error || "Erreur lors de l'enregistrement.");
        return;
      }
      setProduitId("");
      setQuantite("");
      setNote("");
      chargerTout();
    } finally {
      setEnCours(false);
    }
  }

  // Toutes les vues (compteurs, alertes, tableau, sélecteur du mouvement
  // manuel) suivent la gamme choisie en haut de page.
  const itemsAffiches = filtreGamme ? items.filter((i) => i.gammeId === filtreGamme) : items;
  const enAlerte = itemsAffiches.filter((i) => i.enAlerte);
  const totalCartons = itemsAffiches.reduce((s, i) => s + i.quantiteCartons, 0);
  const gammeParId = (id: string | null) => gammes.find((g) => g.id === id);

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconList className="h-5 w-5 text-brass" />
          Gestion de stock
        </h1>
        <p className="text-sm text-ink-muted">
          Stock disponible par produit (en cartons) — décrémenté automatiquement à chaque commande.
        </p>
      </div>

      <div className="mb-5">
        <GammeTabs gammes={gammes} value={filtreGamme} onChange={setFiltreGamme} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="field-card flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
            <IconGlass className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">{itemsAffiches.length}</p>
            <p className="text-xs text-ink-muted">Produits actifs</p>
          </div>
        </div>
        <div className="field-card flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ok/10 text-ok">
            <IconCheckCircle className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">{totalCartons}</p>
            <p className="text-xs text-ink-muted">Cartons en stock</p>
          </div>
        </div>
        <div className="field-card flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${enAlerte.length > 0 ? "bg-danger/10 text-danger" : "bg-ink-muted/10 text-ink-muted"}`}>
            <IconAlert className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">{enAlerte.length}</p>
            <p className="text-xs text-ink-muted">En alerte</p>
          </div>
        </div>
      </div>

      {enAlerte.length > 0 && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <IconAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Stock bas pour : <strong>{enAlerte.map((i) => i.nom).join(", ")}</strong>. Pensez à réapprovisionner.
          </span>
        </div>
      )}

      <p className="section-eyebrow mb-3">Stock par produit</p>
      <div className="mb-8 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-left text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Produit</th>
              <th className="px-4 py-3 font-medium">Gamme</th>
              <th className="px-4 py-3 font-medium">Volume</th>
              <th className="px-4 py-3 font-medium">Stock disponible</th>
              <th className="px-4 py-3 font-medium">Seuil d'alerte</th>
              <th className="px-4 py-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {itemsAffiches.map((i) => (
              <tr key={i.produitId} className={`border-t border-line transition-colors hover:bg-bg-elevated ${i.enAlerte ? "bg-danger/[0.03]" : ""}`}>
                <td className="px-4 py-3 font-medium text-ink">{i.nom}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styleBadgeGamme(i.gammeCode)}`}>
                    {libelleGamme(gammeParId(i.gammeId) || (i.gammeCode ? { code: i.gammeCode, nom: i.gammeCode } : null))}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-muted">{i.volumeMl} ml</td>
                <td className={`px-4 py-3 font-semibold ${i.enAlerte ? "text-danger" : "text-ink"}`}>
                  {i.quantiteCartons} carton{i.quantiteCartons !== 1 ? "s" : ""}
                </td>
                <td className="px-4 py-3 text-ink-muted">{i.seuilAlerte}</td>
                <td className="px-4 py-3">
                  {i.enAlerte ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-0.5 text-[11px] font-semibold text-danger">
                      <IconAlert className="h-3 w-3" /> Stock bas
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-ok/10 px-2.5 py-0.5 text-[11px] font-semibold text-ok">
                      Suffisant
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!chargement && itemsAffiches.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                  Aucun produit actif dans cette gamme.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="field-card mb-8 max-w-2xl">
        <p className="section-eyebrow mb-3">
          <IconPlus className="h-4 w-4" />
          Enregistrer un mouvement manuel
        </p>
        <form onSubmit={enregistrerMouvement} className="grid gap-2 sm:grid-cols-[1.5fr_1fr_1fr_1.5fr_auto]">
          <select className="field-input" value={produitId} onChange={(e) => setProduitId(e.target.value)} required>
            <option value="">Produit…</option>
            {itemsAffiches.map((i) => <option key={i.produitId} value={i.produitId}>{i.nom}</option>)}
          </select>
          <select className="field-input" value={type} onChange={(e) => setType(e.target.value as "ENTREE" | "AJUSTEMENT")}>
            <option value="ENTREE">Entrée (+)</option>
            <option value="AJUSTEMENT">Ajustement (valeur exacte)</option>
          </select>
          <input
            className="field-input"
            type="number"
            placeholder={type === "ENTREE" ? "Quantité" : "Nouvelle quantité"}
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            required
          />
          <input className="field-input" placeholder="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary" type="submit" disabled={enCours}>
            {enCours ? "…" : "Valider"}
          </button>
        </form>
        {erreur && <p className="mt-2 text-sm text-danger">{erreur}</p>}
        <p className="mt-2 text-xs text-ink-muted">
          « Entrée » ajoute la quantité au stock existant (réapprovisionnement). « Ajustement » fixe
          directement la quantité en stock à la valeur saisie (utile après un inventaire physique).
        </p>
      </div>

      <div>
        <p className="section-eyebrow mb-3">Historique des mouvements</p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated text-left text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Produit</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Quantité</th>
                <th className="px-4 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {mouvements.map((m) => (
                <tr key={m.id} className="border-t border-line transition-colors hover:bg-bg-elevated">
                  <td className="px-4 py-3 text-ink-muted">
                    {new Date(m.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3 text-ink">{m.produit.nom}</td>
                  <td className={`px-4 py-3 font-medium ${TYPE_STYLE[m.type] || "text-ink-muted"}`}>
                    {TYPE_LABEL[m.type] || m.type}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {m.type === "SORTIE" ? "-" : m.quantiteCartons >= 0 ? "+" : ""}
                    {m.quantiteCartons}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{m.note || (m.referenceType === "COMMANDE" ? "Commande" : "—")}</td>
                </tr>
              ))}
              {!chargement && mouvements.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                    Aucun mouvement enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
