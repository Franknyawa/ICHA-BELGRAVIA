"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconWallet,
  IconCalendar,
  IconDownload,
  IconPlus,
  IconTrend,
  IconBox,
  IconAlert,
  IconTrash,
  IconReceipt,
} from "@/components/icons";
import { Spinner, ChargementPage } from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { exporterRapportPdf } from "@/lib/rapportPdf";
import { aujourdhuiISO, ajouterJours } from "@/lib/dates";

type LigneJournal = {
  id: string;
  date: string;
  type: "RECETTE" | "DEPENSE";
  categorie: string;
  libelle: string;
  montant: number;
  source: "VENTE" | "MANUEL";
  produit?: string | null;
  quantiteCartons?: number | null;
};
type LigneStock = {
  produitId: string;
  nom: string;
  gammeCode: string | null;
  cartons: number;
  prixVenteCarton: number;
  coutMoyenCarton: number | null;
  valeurVente: number;
  valeurCout: number | null;
};
type Donnees = {
  resume: { recettesVentes: number; recettesAutres: number; recettes: number; depenses: number; solde: number; creancesARecouvrer: number; tronque: boolean };
  global: { recettes: number; depenses: number; solde: number };
  stock: { lignes: LigneStock[]; totalCartons: number; valeurVente: number; valeurCout: number; coutInconnu: boolean };
  parCategorie: { categorie: string; type: string; montant: number }[];
  journal: LigneJournal[];
};

const CATEGORIES_RECETTE: Record<string, string> = {
  ENCAISSEMENT_CREDIT: "Encaissement d'un crédit client",
  AUTRE_RECETTE: "Autre recette",
};
const CATEGORIES_DEPENSE: Record<string, string> = {
  REAPPROVISIONNEMENT: "Achat de stock",
  TRANSPORT: "Transport / livraison",
  COMMISSION: "Commissions / primes",
  FRAIS_DIVERS: "Frais divers",
  AUTRE_DEPENSE: "Autre dépense",
};
const LIBELLE_CATEGORIE: Record<string, string> = { VENTE: "Vente", ...CATEGORIES_RECETTE, ...CATEGORIES_DEPENSE };

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
const jourFr = (iso: string) => {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
};

export default function CaissePage() {
  const aujourdhui = aujourdhuiISO();
  const [du, setDu] = useState(aujourdhui);
  const [au, setAu] = useState(aujourdhui);
  const [data, setData] = useState<Donnees | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreurPage, setErreurPage] = useState<string | null>(null);

  // Formulaire
  const [type, setType] = useState<"RECETTE" | "DEPENSE">("DEPENSE");
  const [categorie, setCategorie] = useState("REAPPROVISIONNEMENT");
  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [produitId, setProduitId] = useState("");
  const [cartons, setCartons] = useState("");
  const [date, setDate] = useState(aujourdhui);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<LigneJournal | null>(null);
  const [suppression, setSuppression] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreurPage(null);
    try {
      const s = new URLSearchParams();
      if (du) s.set("du", du);
      if (au) s.set("au", au);
      const res = await fetch(`/api/caisse?${s.toString()}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setErreurPage("Impossible de charger la caisse. Réessayez.");
    } finally {
      setChargement(false);
    }
  }, [du, au]);

  useEffect(() => {
    charger();
  }, [charger]);

  const raccourcis = [
    { label: "Aujourd'hui", du: aujourdhui, au: aujourdhui },
    { label: "Hier", du: ajouterJours(aujourdhui, -1), au: ajouterJours(aujourdhui, -1) },
    { label: "7 derniers jours", du: ajouterJours(aujourdhui, -6), au: aujourdhui },
    { label: "30 derniers jours", du: ajouterJours(aujourdhui, -29), au: aujourdhui },
    { label: "Tout", du: "", au: "" },
  ];

  const categories = type === "RECETTE" ? CATEGORIES_RECETTE : CATEGORIES_DEPENSE;
  const estAchatStock = type === "DEPENSE" && categorie === "REAPPROVISIONNEMENT";
  const produitChoisi = data?.stock.lignes.find((l) => l.produitId === produitId);
  const montantNum = Number(montant) || 0;
  const soldeApres = data ? data.global.solde + (type === "RECETTE" ? montantNum : -montantNum) : 0;

  function changerType(t: "RECETTE" | "DEPENSE") {
    setType(t);
    setCategorie(t === "RECETTE" ? "ENCAISSEMENT_CREDIT" : "REAPPROVISIONNEMENT");
    setErreur(null);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/caisse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          categorie,
          montant: montantNum,
          libelle,
          date,
          ...(estAchatStock ? { produitId, quantiteCartons: parseInt(cartons, 10) } : {}),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreur(d.error || "Erreur lors de l'enregistrement.");
        return;
      }
      setMontant("");
      setLibelle("");
      setCartons("");
      setProduitId("");
      charger();
    } finally {
      setEnCours(false);
    }
  }

  async function supprimer() {
    if (!aSupprimer) return;
    setSuppression(true);
    try {
      const res = await fetch(`/api/caisse/${aSupprimer.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErreurPage(d.error || "Suppression impossible.");
      else charger();
    } finally {
      setSuppression(false);
      setASupprimer(null);
    }
  }

  const libellePeriode = useMemo(() => {
    if (!du && !au) return "Toutes périodes";
    if (du && du === au) return du === aujourdhui ? "Aujourd'hui" : `Le ${jourFr(du)}`;
    return `${du ? `Du ${jourFr(du)}` : ""} ${au ? `au ${jourFr(au)}` : ""}`.trim();
  }, [du, au, aujourdhui]);

  async function exporterPdf() {
    if (!data) return;
    setExportEnCours(true);
    try {
      await exporterRapportPdf({
        titre: "Journal de caisse",
        sousTitre: `${libellePeriode} · Solde de la période : ${fcfa(data.resume.solde)}`,
        colonnes: [
          { cle: "date", label: "Date" },
          { cle: "categorie", label: "Catégorie" },
          { cle: "libelle", label: "Libellé" },
          { cle: "recette", label: "Recette", droite: true, montant: true },
          { cle: "depense", label: "Dépense", droite: true, montant: true },
        ],
        lignes: data.journal.map((l) => ({
          date: new Date(l.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }),
          categorie: LIBELLE_CATEGORIE[l.categorie] || l.categorie,
          libelle: l.libelle,
          recette: l.type === "RECETTE" ? l.montant : 0,
          depense: l.type === "DEPENSE" ? l.montant : 0,
        })),
        totaux: { recette: data.resume.recettes, depense: data.resume.depenses },
      });
    } finally {
      setExportEnCours(false);
    }
  }

  return (
    <div className="pb-16">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
            <IconWallet className="h-5 w-5 text-brass" />
            Caisse
          </h1>
          <p className="text-sm text-ink-muted">
            Recettes et dépenses, reliées au stock : les ventes encaissées entrent automatiquement, chaque achat de stock
            sort de la caisse et augmente le stock.
          </p>
        </div>
        <button className="btn-secondary" disabled={!data || exportEnCours} onClick={exporterPdf}>
          {exportEnCours ? <Spinner className="h-4 w-4" /> : <IconDownload className="h-4 w-4" />}
          Télécharger PDF
        </button>
      </div>

      {/* Période */}
      <div className="field-card mb-6 flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brass">
          <IconCalendar className="h-4 w-4" />
          Période
        </span>
        {raccourcis.map((r) => {
          const actif = du === r.du && au === r.au;
          return (
            <button
              key={r.label}
              type="button"
              onClick={() => { setDu(r.du); setAu(r.au); }}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                actif ? "border-brass bg-brass text-white" : "border-line text-ink-muted hover:border-brass hover:text-brass"
              }`}
            >
              {r.label}
            </button>
          );
        })}
        <label className="ml-1 flex items-center gap-1.5 text-xs text-ink-muted">
          Du
          <input type="date" className="field-input w-[150px]" value={du} max={au || undefined} onChange={(e) => setDu(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          au
          <input type="date" className="field-input w-[150px]" value={au} min={du || undefined} onChange={(e) => setAu(e.target.value)} />
        </label>
      </div>

      {erreurPage && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <IconAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {erreurPage}
        </div>
      )}

      {!data && chargement && <ChargementPage compact label="Chargement de la caisse…" />}

      {data && (
        <>
          <p className="section-eyebrow mb-3">{libellePeriode}</p>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Solde en caisse (cumul)" valeur={fcfa(data.global.solde)} ton={data.global.solde < 0 ? "danger" : "brass"} fort />
            <Kpi label="Recettes" valeur={fcfa(data.resume.recettes)} ton="ok" detail={`dont ventes ${fcfa(data.resume.recettesVentes)}`} />
            <Kpi label="Dépenses" valeur={fcfa(data.resume.depenses)} ton="warn" />
            <Kpi label="Résultat de la période" valeur={fcfa(data.resume.solde)} ton={data.resume.solde < 0 ? "danger" : "ink"} />
            <Kpi label="Crédits à encaisser" valeur={fcfa(data.resume.creancesARecouvrer)} ton="ink" detail="toutes périodes" />
          </div>

          <div className="mb-8 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            {/* Saisie */}
            <form onSubmit={enregistrer} className="field-card">
              <p className="section-eyebrow mb-3">
                <IconPlus className="h-4 w-4" />
                Nouvelle opération
              </p>
              <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-line p-1">
                {(["DEPENSE", "RECETTE"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => changerType(t)}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                      type === t ? (t === "RECETTE" ? "bg-ok text-white" : "bg-brass text-white") : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {t === "RECETTE" ? "Recette" : "Dépense"}
                  </button>
                ))}
              </div>

              <div className="grid gap-2">
                <select className="field-input" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                  {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>

                {estAchatStock && (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <select className="field-input" value={produitId} onChange={(e) => setProduitId(e.target.value)} required>
                      <option value="">Produit acheté…</option>
                      {data.stock.lignes.map((l) => (
                        <option key={l.produitId} value={l.produitId}>
                          {l.nom} (stock : {l.cartons})
                        </option>
                      ))}
                    </select>
                    <input
                      className="field-input"
                      type="number"
                      min={1}
                      placeholder="Cartons"
                      value={cartons}
                      onChange={(e) => setCartons(e.target.value)}
                      required
                    />
                  </div>
                )}

                <input
                  className="field-input"
                  type="number"
                  min={1}
                  placeholder={estAchatStock ? "Coût total de l'achat (FCFA)" : "Montant (FCFA)"}
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  required
                />
                <input
                  className="field-input"
                  placeholder={estAchatStock ? "Fournisseur / note (optionnel)" : "Libellé (ex. paiement de M. Nkoulou)"}
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                  required={!estAchatStock}
                />
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  Date
                  <input type="date" className="field-input max-w-[170px]" value={date} max={aujourdhui} onChange={(e) => setDate(e.target.value || aujourdhui)} />
                </label>
              </div>

              {estAchatStock && produitChoisi && Number(cartons) > 0 && (
                <p className="mt-3 rounded-md bg-brass/10 px-3 py-2 text-xs text-ink">
                  Stock de {produitChoisi.nom} : {produitChoisi.cartons} → <strong>{produitChoisi.cartons + (parseInt(cartons, 10) || 0)} cartons</strong>
                  {montantNum > 0 && <> · coût de {fcfa(montantNum / parseInt(cartons, 10))} / carton</>}
                </p>
              )}
              {montantNum > 0 && (
                <p className={`mt-2 text-xs ${soldeApres < 0 ? "font-medium text-danger" : "text-ink-muted"}`}>
                  Solde de caisse après l'opération : {fcfa(soldeApres)}
                  {soldeApres < 0 && " — la caisse serait en négatif."}
                </p>
              )}
              {erreur && <p className="mt-2 text-sm text-danger">{erreur}</p>}
              <button className="btn-primary mt-4 w-full" type="submit" disabled={enCours}>
                {enCours ? "Enregistrement…" : "Enregistrer l'opération"}
              </button>
            </form>

            {/* Stock valorisé */}
            <div className="field-card">
              <p className="section-eyebrow mb-3">
                <IconBox className="h-4 w-4" />
                Stock présent en caisse
              </p>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <Mini label="Cartons en stock" valeur={data.stock.totalCartons.toLocaleString("fr-FR")} />
                <Mini label="Valeur à la vente" valeur={fcfa(data.stock.valeurVente)} />
                <Mini label="Valeur au coût" valeur={data.stock.valeurCout > 0 ? fcfa(data.stock.valeurCout) : "—"} />
              </div>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-bg-elevated text-left text-ink-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Produit</th>
                      <th className="px-3 py-2 text-right font-medium">Cartons</th>
                      <th className="px-3 py-2 text-right font-medium">Prix vente</th>
                      <th className="px-3 py-2 text-right font-medium">Coût moyen</th>
                      <th className="px-3 py-2 text-right font-medium">Valeur vente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stock.lignes.map((l) => (
                      <tr key={l.produitId} className="border-t border-line">
                        <td className="px-3 py-2 text-ink">{l.nom}</td>
                        <td className="px-3 py-2 text-right font-medium text-ink">{l.cartons}</td>
                        <td className="px-3 py-2 text-right text-ink-muted">{fcfa(l.prixVenteCarton)}</td>
                        <td className="px-3 py-2 text-right text-ink-muted">{l.coutMoyenCarton !== null ? fcfa(l.coutMoyenCarton) : "—"}</td>
                        <td className="px-3 py-2 text-right text-ink">{fcfa(l.valeurVente)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                Valeur à la vente : cartons × prix du palier « 1 carton ». Le coût moyen se calcule à partir des achats de stock
                saisis ici ou dans l'onglet Stock
                {data.stock.coutInconnu && " — certains produits n'ont pas encore d'achat enregistré."}
              </p>
            </div>
          </div>

          {data.parCategorie.length > 0 && (
            <div className="mb-8">
              <p className="section-eyebrow mb-3">Répartition de la période</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {data.parCategorie.map((c) => (
                  <div key={c.categorie} className="field-card flex items-center justify-between gap-3 py-3">
                    <span className="text-sm text-ink-muted">{LIBELLE_CATEGORIE[c.categorie] || c.categorie}</span>
                    <span className={`text-sm font-semibold ${c.type === "RECETTE" ? "text-ok" : "text-warn"}`}>
                      {c.type === "RECETTE" ? "+" : "−"}{fcfa(c.montant)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="section-eyebrow mb-3">
            <IconReceipt className="h-4 w-4" />
            Journal de caisse
          </p>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated text-left text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Catégorie</th>
                  <th className="px-4 py-3 font-medium">Libellé</th>
                  <th className="px-4 py-3 text-right font-medium">Recette</th>
                  <th className="px-4 py-3 text-right font-medium">Dépense</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.journal.map((l) => (
                  <tr key={l.id} className="border-t border-line transition-colors hover:bg-bg-elevated">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                      {new Date(l.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${l.source === "VENTE" ? "bg-ok/10 text-ok" : "bg-brass/10 text-brass"}`}>
                        {LIBELLE_CATEGORIE[l.categorie] || l.categorie}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink">{l.libelle}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ok">{l.type === "RECETTE" ? fcfa(l.montant) : ""}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-warn">{l.type === "DEPENSE" ? fcfa(l.montant) : ""}</td>
                    <td className="px-2 py-3 text-right">
                      {l.source === "MANUEL" && (
                        <button
                          type="button"
                          aria-label="Annuler cette opération"
                          title="Annuler cette opération"
                          onClick={() => setASupprimer(l)}
                          className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.journal.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">Aucune opération sur cette période.</td>
                  </tr>
                )}
              </tbody>
              {data.journal.length > 0 && (
                <tfoot className="border-t border-line bg-bg-elevated font-semibold text-ink">
                  <tr>
                    <td className="px-4 py-3" colSpan={3}>Total de la période</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-ok">{fcfa(data.resume.recettes)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-warn">{fcfa(data.resume.depenses)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {data.resume.tronque && (
            <p className="mt-2 text-xs text-warn">Le journal est limité aux 1 000 dernières lignes ; réduisez la période pour tout voir.</p>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!aSupprimer}
        title="Annuler cette opération ?"
        message={
          aSupprimer?.categorie === "REAPPROVISIONNEMENT"
            ? "Cet achat de stock sera retiré de la caisse et les cartons ajoutés seront retirés du stock."
            : "Cette opération sera retirée du journal de caisse."
        }
        confirmLabel="Annuler l'opération"
        cancelLabel="Garder"
        pending={suppression}
        onConfirm={supprimer}
        onCancel={() => setASupprimer(null)}
      />
    </div>
  );
}

function Kpi({
  label,
  valeur,
  detail,
  ton,
  fort,
}: {
  label: string;
  valeur: string;
  detail?: string;
  ton: "brass" | "ok" | "warn" | "danger" | "ink";
  fort?: boolean;
}) {
  const couleur = { brass: "text-brass", ok: "text-ok", warn: "text-warn", danger: "text-danger", ink: "text-ink" }[ton];
  return (
    <div className={`field-card ${fort ? "col-span-2 border-brass/30 bg-gradient-to-br from-bg-card to-bg-elevated lg:col-span-1" : ""}`}>
      <p className="mb-1 flex items-center gap-1.5 text-xs text-ink-muted">
        {fort && <IconTrend className="h-3.5 w-3.5 text-brass" />}
        {label}
      </p>
      <p className={`font-display text-xl sm:text-2xl ${couleur}`}>{valeur}</p>
      {detail && <p className="mt-0.5 text-[11px] text-ink-muted">{detail}</p>}
    </div>
  );
}

function Mini({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="rounded-lg bg-bg-elevated px-2 py-2.5">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="font-display text-base text-ink sm:text-lg">{valeur}</p>
    </div>
  );
}
