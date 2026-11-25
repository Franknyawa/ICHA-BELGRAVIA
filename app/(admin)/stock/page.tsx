"use client";

import { formaterCartons } from "@/lib/quantites";
import { useEffect, useState } from "react";
import { peut } from "@/lib/permissions";
import { useEcriture } from "@/lib/useEcriture";
import { IconList, IconAlert, IconPlus, IconCheckCircle, IconGlass, IconBox } from "@/components/icons";
import { nombreFr } from "@/lib/format";
import GammeTabs from "@/components/GammeTabs";
import { styleBadgeGamme, libelleGamme, type GammeInfo } from "@/lib/gammesClient";
import { Spinner, ChargementPage } from "@/components/Spinner";

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

type SommeHV = { cartons: number; operations: number };
type HorsVente = { AVARIE: SommeHV; ECHANTILLON: SommeHV; GIFT: SommeHV };
const VIDE_HV: HorsVente = { AVARIE: { cartons: 0, operations: 0 }, ECHANTILLON: { cartons: 0, operations: 0 }, GIFT: { cartons: 0, operations: 0 } };

/** Libellé et couleur d'un mouvement : la nature (vente, avarie, échantillon, retour…) prime sur le type brut. */
function natureMouvement(m: Pick<Mouvement, "type" | "referenceType">): { label: string; style: string; signe: "+" | "-" | "" } {
  if (m.referenceType === "AVARIE") return { label: "Avarie", style: "text-danger", signe: "-" };
  if (m.referenceType === "ECHANTILLON") return { label: "Échantillon", style: "text-[rgb(126,34,206)]", signe: "-" };
  if (m.referenceType === "GIFT") return { label: "Gift", style: "text-brass", signe: "-" };
  if (m.referenceType === "RETOUR") return { label: "Retour client", style: "text-ok", signe: "+" };
  if (m.type === "SORTIE") return { label: m.referenceType === "COMMANDE" ? "Vente" : "Sortie", style: "text-ink-muted", signe: "-" };
  if (m.type === "ENTREE") return { label: "Entrée", style: "text-ok", signe: "+" };
  return { label: "Ajustement", style: "text-brass", signe: "" };
}
const TYPES_HISTORIQUE = [
  ["", "Tous les mouvements"],
  ["ENTREE", "Entrées"],
  ["VENTE", "Ventes"],
  ["RETOUR", "Retours clients"],
  ["AVARIE", "Avaries"],
  ["ECHANTILLON", "Échantillons"],
  ["GIFT", "Gifts"],
  ["AJUSTEMENT", "Ajustements"],
] as const;

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
  const [cout, setCout] = useState("");
  const ecriture = useEcriture("stock");
  const [voitCout, setVoitCout] = useState(false); // le coût d'achat alimente la caisse
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Sorties hors vente (avaries / échantillons)
  const [hvProduit, setHvProduit] = useState("");
  const [hvType, setHvType] = useState<"AVARIE" | "ECHANTILLON" | "GIFT">("AVARIE");
  const [hvQuantite, setHvQuantite] = useState("");
  const [hvMotif, setHvMotif] = useState("");
  const [hvErreur, setHvErreur] = useState<string | null>(null);
  const [hvEnCours, setHvEnCours] = useState(false);
  const [horsVente, setHorsVente] = useState<HorsVente>(VIDE_HV);
  // Historique : filtres + pagination
  const [hDu, setHDu] = useState("");
  const [hAu, setHAu] = useState("");
  const [hProduit, setHProduit] = useState("");
  const [hType, setHType] = useState("");
  const [hPage, setHPage] = useState(1);
  const [hTotal, setHTotal] = useState(0);
  const [hTaille, setHTaille] = useState(25);

  async function chargerStock() {
    const res = await fetch("/api/stock");
    const data = await res.json();
    setItems(data.items || []);
  }
  async function chargerMouvements(page = hPage) {
    const s = new URLSearchParams({ page: String(page) });
    if (hDu) s.set("dateFrom", hDu);
    if (hAu) s.set("dateTo", hAu);
    if (hProduit) s.set("produitId", hProduit);
    if (hType) s.set("type", hType);
    const res = await fetch(`/api/stock/mouvements?${s}`);
    const data = await res.json();
    setMouvements(data.items || []);
    setHTotal(data.total || 0);
    setHTaille(data.pageSize || 25);
    setHorsVente(data.horsVente || VIDE_HV);
  }

  async function chargerTout() {
    setChargement(true);
    await Promise.all([chargerStock(), chargerMouvements()]);
    setChargement(false);
  }

  // Tout changement de filtre repart de la première page.
  useEffect(() => {
    setHPage(1);
    chargerMouvements(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hDu, hAu, hProduit, hType]);

  async function retirerDuStock(e: React.FormEvent) {
    e.preventDefault();
    setHvErreur(null);
    setHvEnCours(true);
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produitId: hvProduit, type: hvType, quantiteCartons: parseFloat(hvQuantite.replace(",", ".")), note: hvMotif }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return setHvErreur(data.error || "Retrait impossible.");
      }
      setHvProduit("");
      setHvQuantite("");
      setHvMotif("");
      await Promise.all([chargerStock(), chargerMouvements(1)]);
      setHPage(1);
    } finally {
      setHvEnCours(false);
    }
  }

  useEffect(() => {
    chargerTout();
    fetch("/api/me").then((r) => r.json()).then((d) => setVoitCout(peut(d.role, "caisse"))).catch(() => {});
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
        body: JSON.stringify({
          produitId,
          type,
          quantiteCartons: parseFloat(quantite.replace(",", ".")),
          note,
          ...(voitCout && type === "ENTREE" && cout ? { coutTotal: Number(cout) } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErreur(data.error || "Erreur lors de l'enregistrement.");
        return;
      }
      setProduitId("");
      setQuantite("");
      setNote("");
      setCout("");
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
            <p className="font-display text-2xl text-ink">{formaterCartons(totalCartons)}</p>
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
                  {formaterCartons(i.quantiteCartons)} carton{i.quantiteCartons !== 1 ? "s" : ""}
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
            {chargement && itemsAffiches.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <ChargementPage compact label="Chargement du stock…" />
                </td>
              </tr>
            )}
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

      {ecriture && (
      <div className="field-card mb-8 w-full">
        <p className="section-eyebrow mb-3">
          <IconPlus className="h-4 w-4" />
          Enregistrer un mouvement manuel
        </p>
        <form onSubmit={enregistrerMouvement} className={`grid gap-2 ${
            type === "ENTREE" && voitCout
              ? "md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.7fr)_minmax(0,2fr)_auto]"
              : "md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,2fr)_auto]"
          }`}>
          <select className="field-input !min-w-0" value={produitId} onChange={(e) => setProduitId(e.target.value)} required>
            <option value="">Produit…</option>
            {itemsAffiches.map((i) => <option key={i.produitId} value={i.produitId}>{i.nom}</option>)}
          </select>
          <select className="field-input !min-w-0" value={type} onChange={(e) => setType(e.target.value as "ENTREE" | "AJUSTEMENT")}>
            <option value="ENTREE">Entrée (+)</option>
            <option value="AJUSTEMENT">Ajustement (valeur exacte)</option>
          </select>
          <input
            className="field-input"
            type="number"
            step={0.25}
            placeholder={type === "ENTREE" ? "Quantité" : "Nouvelle quantité"}
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            required
          />
          {type === "ENTREE" && voitCout && (
            <input
              className="field-input"
              type="number"
              min={0}
              placeholder="Coût total (FCFA)"
              value={cout}
              onChange={(e) => setCout(e.target.value)}
            />
          )}
          <input className="field-input" placeholder="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary" type="submit" disabled={enCours}>
            {enCours ? "…" : "Valider"}
          </button>
        </form>
        {erreur && <p className="mt-2 text-sm text-danger">{erreur}</p>}
        <p className="mt-2 text-xs text-ink-muted">
          « Entrée » ajoute la quantité au stock existant (réapprovisionnement) ; si vous indiquez le coût d'achat,
          une dépense est enregistrée automatiquement dans la caisse. « Ajustement » fixe
          directement la quantité en stock à la valeur saisie (utile après un inventaire physique).
        </p>
      </div>
      )}

      <section className="mb-8">
        <p className="section-eyebrow mb-1">
          <IconBox className="h-4 w-4" />
          Sorties hors vente
        </p>
        <p className="mb-3 text-xs font-medium text-ink-muted">
          Le stock diminue mais rien n'est facturé (par quart de carton possible : 6 bouteilles). Les totaux suivent la période choisie dans l'historique.
        </p>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <div className="field-card !border-danger/30 !bg-danger/[0.04]">
            <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-danger/10 text-danger"><IconAlert className="h-5 w-5" /></span>
            <p className="text-base font-extrabold text-ink">Avaries</p>
            <p className="text-xs font-medium text-ink-muted">Produit abîmé, périmé ou perdu</p>
            <p className="mt-2 text-2xl font-extrabold text-ink"><span className="montant">{nombreFr(horsVente.AVARIE.cartons)}</span> <span className="text-xs font-bold text-ink-muted">cartons</span></p>
            <p className="text-xs font-medium text-ink-muted"><span className="montant">{horsVente.AVARIE.operations}</span> opération{horsVente.AVARIE.operations > 1 ? "s" : ""}</p>
          </div>
          <div className="field-card !border-[rgb(126,34,206)]/25 !bg-[rgb(126,34,206)]/[0.04]">
            <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[rgb(126,34,206)]/10 text-[rgb(126,34,206)]"><IconGlass className="h-5 w-5" /></span>
            <p className="text-base font-extrabold text-ink">Échantillons</p>
            <p className="text-xs font-medium text-ink-muted">Offerts pour faire tester le produit</p>
            <p className="mt-2 text-2xl font-extrabold text-ink"><span className="montant">{nombreFr(horsVente.ECHANTILLON.cartons)}</span> <span className="text-xs font-bold text-ink-muted">cartons</span></p>
            <p className="text-xs font-medium text-ink-muted"><span className="montant">{horsVente.ECHANTILLON.operations}</span> opération{horsVente.ECHANTILLON.operations > 1 ? "s" : ""}</p>
          </div>
          <div className="field-card !border-brass/30 !bg-brass/[0.05]">
            <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-brass/10 text-brass"><IconPlus className="h-5 w-5" /></span>
            <p className="text-base font-extrabold text-ink">Gifts</p>
            <p className="text-xs font-medium text-ink-muted">Cadeaux et gestes commerciaux</p>
            <p className="mt-2 text-2xl font-extrabold text-ink"><span className="montant">{nombreFr(horsVente.GIFT.cartons)}</span> <span className="text-xs font-bold text-ink-muted">cartons</span></p>
            <p className="text-xs font-medium text-ink-muted"><span className="montant">{horsVente.GIFT.operations}</span> opération{horsVente.GIFT.operations > 1 ? "s" : ""}</p>
          </div>
        </div>
        {ecriture && (
          <form onSubmit={retirerDuStock} className="field-card grid gap-2 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,2.2fr)_auto]">
            <select className="field-input !min-w-0" value={hvProduit} onChange={(e) => setHvProduit(e.target.value)} required aria-label="Produit">
              <option value="">Produit…</option>
              {itemsAffiches.map((i) => (
                <option key={i.produitId} value={i.produitId}>{i.nom} — {formaterCartons(i.quantiteCartons)} carton{i.quantiteCartons !== 1 ? "s" : ""} en stock</option>
              ))}
            </select>
            <select className="field-input !min-w-0" value={hvType} onChange={(e) => setHvType(e.target.value as "AVARIE" | "ECHANTILLON" | "GIFT")} aria-label="Nature de la sortie">
              <option value="AVARIE">Avarie</option>
              <option value="ECHANTILLON">Échantillon</option>
              <option value="GIFT">Gift</option>
            </select>
            <input className="field-input" type="number" min={0.25} step={0.25} placeholder="Cartons" value={hvQuantite} onChange={(e) => setHvQuantite(e.target.value)} required aria-label="Quantité en cartons" />
            <input className="field-input" placeholder={hvType === "AVARIE" ? "Motif (ex : cartons mouillés)" : hvType === "GIFT" ? "Motif (ex : cadeau à un partenaire)" : "Motif (ex : dégustation chez un client)"} value={hvMotif} onChange={(e) => setHvMotif(e.target.value)} required minLength={3} aria-label="Motif" />
            <button className="btn-primary" type="submit" disabled={hvEnCours}>{hvEnCours ? "…" : "Retirer du stock"}</button>
          </form>
        )}
        {hvErreur && <p className="mt-2 text-sm font-bold text-danger" role="alert">{hvErreur}</p>}
      </section>

      <div>
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <p className="section-eyebrow">Historique des mouvements</p>
          <span className="text-xs font-medium text-ink-muted"><span className="montant">{nombreFr(hTotal)}</span> au total</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <input type="date" className="field-input !w-40" aria-label="Du" value={hDu} onChange={(e) => setHDu(e.target.value)} />
          <input type="date" className="field-input !w-40" aria-label="Au" value={hAu} onChange={(e) => setHAu(e.target.value)} />
          <select className="field-input" aria-label="Produit" value={hProduit} onChange={(e) => setHProduit(e.target.value)}>
            <option value="">Tous les produits</option>
            {items.map((i) => <option key={i.produitId} value={i.produitId}>{i.nom}</option>)}
          </select>
          <select className="field-input" aria-label="Type de mouvement" value={hType} onChange={(e) => setHType(e.target.value)}>
            {TYPES_HISTORIQUE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
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
              {mouvements.map((m) => {
                const nat = natureMouvement(m);
                return (
                  <tr key={m.id} className="border-t border-line transition-colors hover:bg-bg-elevated">
                    <td className="px-4 py-3 text-ink-muted">
                      {new Date(m.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3 text-ink">{m.produit.nom}</td>
                    <td className={`px-4 py-3 font-medium ${nat.style}`}>{nat.label}</td>
                    <td className="montant px-4 py-3 text-ink-muted">
                      {nat.signe || (m.quantiteCartons >= 0 ? "+" : "")}
                      {nat.signe ? formaterCartons(Math.abs(m.quantiteCartons)) : formaterCartons(m.quantiteCartons)}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{m.note || (m.referenceType === "COMMANDE" ? "Commande" : "—")}</td>
                  </tr>
                );
              })}
              {!chargement && mouvements.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                    Aucun mouvement pour ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {hTotal > hTaille && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button className="btn-secondary" disabled={hPage <= 1} onClick={() => { const p = hPage - 1; setHPage(p); chargerMouvements(p); }}>Précédent</button>
            <span className="text-sm font-medium text-ink-muted">Page <span className="montant">{hPage}</span> / <span className="montant">{Math.ceil(hTotal / hTaille)}</span></span>
            <button className="btn-secondary" disabled={hPage * hTaille >= hTotal} onClick={() => { const p = hPage + 1; setHPage(p); chargerMouvements(p); }}>Suivant</button>
          </div>
        )}
      </div>
    </div>
  );
}
