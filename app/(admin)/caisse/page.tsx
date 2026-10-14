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
  IconPrinter,
  IconUser,
  IconPin,
} from "@/components/icons";
import { Spinner, ChargementPage } from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { exporterRapportPdf } from "@/lib/rapportPdf";
import { aujourdhuiISO, ajouterJours } from "@/lib/dates";
import { telechargerCsv } from "@/lib/csv";
import { NOM_APP } from "@/lib/marque";

type Mode = "ESPECES" | "ORANGE_MONEY" | "MTN_MOMO" | "MOBILE_MONEY";
type Details = {
  commandeId: string;
  pointVente: string;
  localisation: string;
  client: string;
  telephone: string | null;
  agent: string;
  modePaiementCommande: string;
  montantTotal: number;
  reste: number;
};
type Creance = Details & { date: string };
type LigneJournal = {
  id: string;
  date: string;
  type: "RECETTE" | "DEPENSE";
  categorie: string;
  libelle: string;
  montant: number;
  credit: number;
  source: "VENTE" | "ENCAISSEMENT" | "MANUEL";
  mode: Mode | null;
  details?: Details;
  produit?: string | null;
  quantiteCartons?: number | null;
  annulable: boolean;
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
  resume: {
    recettesVentes: number;
    recettesEncaissements: number;
    recettesAutres: number;
    recettes: number;
    depenses: number;
    solde: number;
    creditAccorde: number;
    creancesARecouvrer: number;
    nbCreances: number;
    parMode: Record<string, number>;
    tronque: boolean;
  };
  global: {
    recettes: number;
    depenses: number;
    solde: number;
    parMode: Record<Mode, { recettes: number; depenses: number; solde: number }>;
  };
  stock: { lignes: LigneStock[]; totalCartons: number; valeurVente: number; valeurCout: number; coutInconnu: boolean };
  creances: Creance[];
  parCategorie: { categorie: string; type: string; montant: number }[];
  journal: LigneJournal[];
};

const MODES: Record<Mode, string> = {
  ESPECES: "Espèces",
  ORANGE_MONEY: "Orange Money",
  MTN_MOMO: "MTN MoMo",
  MOBILE_MONEY: "Mobile Money",
};

const CATEGORIES_RECETTE: Record<string, string> = {
  AUTRE_RECETTE: "Autre recette",
};
const CATEGORIES_DEPENSE: Record<string, string> = {
  REAPPROVISIONNEMENT: "Achat de stock",
  TRANSPORT: "Transport / livraison",
  COMMISSION: "Commissions / primes",
  FRAIS_DIVERS: "Frais divers",
  AUTRE_DEPENSE: "Autre dépense",
};
const LIBELLE_CATEGORIE: Record<string, string> = {
  VENTE: "Vente",
  ENCAISSEMENT_CREDIT: "Encaissement de crédit",
  ...CATEGORIES_RECETTE,
  ...CATEGORIES_DEPENSE,
};

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
const jourFr = (iso: string) => {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
};

type Onglet = "ENCAISSEMENT" | "DEPENSE" | "RECETTE";

export default function CaissePage() {
  const aujourdhui = aujourdhuiISO();
  const [du, setDu] = useState(aujourdhui);
  const [au, setAu] = useState(aujourdhui);
  const [data, setData] = useState<Donnees | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreurPage, setErreurPage] = useState<string | null>(null);
  const [filtreMode, setFiltreMode] = useState<"" | Mode>("");
  const [filtreSource, setFiltreSource] = useState<"" | "VENTE" | "ENCAISSEMENT" | "MANUEL" | "CREDIT">("");

  // Formulaire
  const [onglet, setOnglet] = useState<Onglet>("ENCAISSEMENT");
  const [categorie, setCategorie] = useState("REAPPROVISIONNEMENT");
  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [produitId, setProduitId] = useState("");
  const [cartons, setCartons] = useState("");
  const [mode, setMode] = useState<"ESPECES" | "ORANGE_MONEY" | "MTN_MOMO">("ESPECES");
  const [commandeId, setCommandeId] = useState("");
  const [rechercheCreance, setRechercheCreance] = useState("");
  const [date, setDate] = useState(aujourdhui);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<LigneJournal | null>(null);
  const [suppression, setSuppression] = useState(false);
  const [exportEnCours, setExportEnCours] = useState<"pdf" | "csv" | null>(null);

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

  const estEncaissement = onglet === "ENCAISSEMENT";
  const type: "RECETTE" | "DEPENSE" = onglet === "RECETTE" ? "RECETTE" : onglet === "DEPENSE" ? "DEPENSE" : "RECETTE";
  const categories = onglet === "RECETTE" ? CATEGORIES_RECETTE : CATEGORIES_DEPENSE;
  const estAchatStock = onglet === "DEPENSE" && categorie === "REAPPROVISIONNEMENT";
  const produitChoisi = data?.stock.lignes.find((l) => l.produitId === produitId);
  const creanceChoisie = data?.creances.find((c) => c.commandeId === commandeId);
  const montantNum = Number(montant) || 0;
  const soldeApres = data ? data.global.solde + (type === "RECETTE" ? montantNum : -montantNum) : 0;

  const creancesFiltrees = useMemo(() => {
    if (!data) return [];
    const q = rechercheCreance.trim().toLowerCase();
    if (!q) return data.creances;
    return data.creances.filter((c) => `${c.pointVente} ${c.localisation} ${c.client} ${c.agent}`.toLowerCase().includes(q));
  }, [data, rechercheCreance]);

  function changerOnglet(o: Onglet) {
    setOnglet(o);
    setCategorie(o === "RECETTE" ? "AUTRE_RECETTE" : "REAPPROVISIONNEMENT");
    setErreur(null);
    setMontant("");
  }

  function choisirCreance(id: string) {
    setCommandeId(id);
    const c = data?.creances.find((x) => x.commandeId === id);
    setMontant(c ? String(c.reste) : "");
    setErreur(null);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (estEncaissement && !commandeId) {
      setErreur("Choisissez le crédit à encaisser.");
      return;
    }
    setEnCours(true);
    try {
      const res = await fetch("/api/caisse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          categorie: estEncaissement ? "ENCAISSEMENT_CREDIT" : categorie,
          montant: montantNum,
          libelle,
          date,
          modePaiement: mode,
          ...(estEncaissement ? { commandeId } : {}),
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
      setCommandeId("");
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

  // Journal filtré (mode de paiement / nature de l'opération), utilisé à l'écran et dans les exports.
  const journal = useMemo(() => {
    if (!data) return [];
    return data.journal.filter((l) => {
      if (filtreMode && l.mode !== filtreMode) return false;
      if (filtreSource === "CREDIT") return l.credit > 0;
      if (filtreSource && l.source !== filtreSource) return false;
      return true;
    });
  }, [data, filtreMode, filtreSource]);

  const totauxJournal = useMemo(
    () => ({
      recettes: journal.filter((l) => l.type === "RECETTE").reduce((s, l) => s + l.montant, 0),
      depenses: journal.filter((l) => l.type === "DEPENSE").reduce((s, l) => s + l.montant, 0),
      credit: journal.reduce((s, l) => s + l.credit, 0),
    }),
    [journal]
  );

  const sousTitreExport = () =>
    `${libellePeriode}${filtreMode ? ` · ${MODES[filtreMode]}` : ""}${filtreSource ? ` · ${{ VENTE: "Ventes", ENCAISSEMENT: "Encaissements", MANUEL: "Opérations manuelles", CREDIT: "Ventes à crédit" }[filtreSource]}` : ""} · Solde : ${fcfa(totauxJournal.recettes - totauxJournal.depenses)}`;

  const ligneExport = (l: LigneJournal) => ({
    date: new Date(l.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }),
    operation: LIBELLE_CATEGORIE[l.categorie] || l.categorie,
    pointVente: l.details?.pointVente || l.libelle,
    localisation: l.details?.localisation || "—",
    client: l.details ? `${l.details.client}${l.details.telephone ? ` (${l.details.telephone})` : ""}` : "—",
    agent: l.details?.agent || "—",
    mode: l.mode ? MODES[l.mode] : l.credit > 0 ? "Crédit" : "—",
    credit: l.credit,
    recette: l.type === "RECETTE" ? l.montant : 0,
    depense: l.type === "DEPENSE" ? l.montant : 0,
  });

  async function exporterPdf() {
    if (!data) return;
    setExportEnCours("pdf");
    try {
      await exporterRapportPdf({
        titre: "Journal de caisse",
        sousTitre: sousTitreExport(),
        colonnes: [
          { cle: "date", label: "Date" },
          { cle: "operation", label: "Opération" },
          { cle: "pointVente", label: "Point de vente" },
          { cle: "localisation", label: "Localisation" },
          { cle: "client", label: "Client" },
          { cle: "mode", label: "Mode" },
          { cle: "credit", label: "À crédit", droite: true, montant: true },
          { cle: "recette", label: "Recette", droite: true, montant: true },
          { cle: "depense", label: "Dépense", droite: true, montant: true },
        ],
        lignes: journal.map(ligneExport),
        totaux: { credit: totauxJournal.credit, recette: totauxJournal.recettes, depense: totauxJournal.depenses },
      });
    } finally {
      setExportEnCours(null);
    }
  }

  function exporterCsv() {
    setExportEnCours("csv");
    try {
      telechargerCsv(
        "journal-de-caisse",
        ["Date", "Opération", "Libellé", "Point de vente", "Localisation", "Client", "Téléphone client", "Agent", "Mode", "Montant de la commande", "À crédit", "Reste dû actuel", "Recette", "Dépense"],
        journal.map((l) => [
          new Date(l.date).toLocaleString("fr-FR"),
          LIBELLE_CATEGORIE[l.categorie] || l.categorie,
          l.libelle,
          l.details?.pointVente || "",
          l.details?.localisation || "",
          l.details?.client || "",
          l.details?.telephone || "",
          l.details?.agent || "",
          l.mode ? MODES[l.mode] : l.credit > 0 ? "Crédit" : "",
          l.details?.montantTotal ?? "",
          l.credit,
          l.details?.reste ?? "",
          l.type === "RECETTE" ? l.montant : 0,
          l.type === "DEPENSE" ? l.montant : 0,
        ])
      );
    } finally {
      setExportEnCours(null);
    }
  }

  return (
    <div className="pb-16">
      <div className="mb-5 hidden print:block">
        <h1 className="font-display text-2xl text-ink">{NOM_APP} — Journal de caisse</h1>
        <p className="text-sm text-ink-muted">{sousTitreExport()}</p>
        <p className="text-xs text-ink-muted">Généré le {new Date().toLocaleDateString("fr-FR")}</p>
      </div>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 no-print">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
            <IconWallet className="h-5 w-5 text-brass" />
            Caisse
          </h1>
          <p className="text-sm text-ink-muted">
            Reliée aux commandes des commerciaux : ventes comptant, acomptes, paiements Orange Money / MTN MoMo et crédits y figurent
            automatiquement. Chaque encaissement de crédit met à jour la commande.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={!data || exportEnCours !== null} onClick={exporterPdf}>
            {exportEnCours === "pdf" ? <Spinner className="h-4 w-4" /> : <IconDownload className="h-4 w-4" />}
            PDF
          </button>
          <button className="btn-secondary" disabled={!data || exportEnCours !== null} onClick={exporterCsv}>
            <IconDownload className="h-4 w-4" />
            CSV
          </button>
          <button className="btn-secondary" disabled={!data} onClick={() => window.print()}>
            <IconPrinter className="h-4 w-4" />
            Imprimer
          </button>
        </div>
      </div>

      {/* Période */}
      <div className="field-card mb-6 flex flex-wrap items-center gap-2 no-print">
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
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger no-print">
          <IconAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {erreurPage}
        </div>
      )}

      {!data && chargement && <ChargementPage compact label="Chargement de la caisse…" />}

      {data && (
        <>
          <p className="section-eyebrow mb-3 no-print">{libellePeriode}</p>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-5 no-print">
            <Kpi label="Solde en caisse (cumul)" valeur={fcfa(data.global.solde)} ton={data.global.solde < 0 ? "danger" : "brass"} fort />
            <Kpi
              label="Recettes"
              valeur={fcfa(data.resume.recettes)}
              ton="ok"
              detail={`ventes ${fcfa(data.resume.recettesVentes)} · encaiss. ${fcfa(data.resume.recettesEncaissements)}`}
            />
            <Kpi label="Dépenses" valeur={fcfa(data.resume.depenses)} ton="warn" />
            <Kpi label="Résultat de la période" valeur={fcfa(data.resume.solde)} ton={data.resume.solde < 0 ? "danger" : "ink"} />
            <Kpi
              label="Crédits à encaisser"
              valeur={fcfa(data.resume.creancesARecouvrer)}
              ton="danger"
              detail={`${data.resume.nbCreances} commande${data.resume.nbCreances > 1 ? "s" : ""} · toutes périodes`}
            />
          </div>

          <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 no-print">
            {(Object.keys(MODES) as Mode[])
              .filter((m) => m !== "MOBILE_MONEY" || data.global.parMode.MOBILE_MONEY.recettes > 0)
              .map((m) => (
                <div key={m} className="rounded-lg border border-line bg-bg-card px-3 py-2.5">
                  <p className="text-[11px] text-ink-muted">Solde {MODES[m]}</p>
                  <p className={`font-display text-lg ${data.global.parMode[m].solde < 0 ? "text-danger" : "text-ink"}`}>{fcfa(data.global.parMode[m].solde)}</p>
                  <p className="text-[11px] text-ink-muted">période : +{fcfa(data.resume.parMode[m] || 0)}</p>
                </div>
              ))}
          </div>

          <div className="mb-8 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] no-print">
            {/* Saisie */}
            <form onSubmit={enregistrer} className="field-card">
              <p className="section-eyebrow mb-3">
                <IconPlus className="h-4 w-4" />
                Nouvelle opération
              </p>
              <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-line p-1">
                {([["ENCAISSEMENT", "Encaisser un crédit"], ["DEPENSE", "Dépense"], ["RECETTE", "Autre recette"]] as const).map(([t, l]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => changerOnglet(t)}
                    className={`rounded-md px-2 py-2 text-xs font-medium transition sm:text-sm ${
                      onglet === t ? (t === "DEPENSE" ? "bg-brass text-white" : "bg-ok text-white") : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div className="grid gap-2">
                {estEncaissement ? (
                  <>
                    <input
                      className="field-input"
                      placeholder="Rechercher un point de vente, un quartier, un client…"
                      value={rechercheCreance}
                      onChange={(e) => setRechercheCreance(e.target.value)}
                    />
                    <select className="field-input" value={commandeId} onChange={(e) => choisirCreance(e.target.value)} required>
                      <option value="">
                        {data.creances.length === 0 ? "Aucun crédit à encaisser" : `Crédit à encaisser… (${creancesFiltrees.length})`}
                      </option>
                      {creancesFiltrees.map((c) => (
                        <option key={c.commandeId} value={c.commandeId}>
                          {c.pointVente} — {c.localisation} — reste {fcfa(c.reste)}
                        </option>
                      ))}
                    </select>
                    {creanceChoisie && (
                      <div className="rounded-lg border border-brass/30 bg-brass/5 p-3 text-sm">
                        <p className="font-medium text-ink">{creanceChoisie.pointVente}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                          <IconPin className="h-3.5 w-3.5" /> {creanceChoisie.localisation}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                          <IconUser className="h-3.5 w-3.5" /> Client : {creanceChoisie.client}
                          {creanceChoisie.telephone ? ` · ${creanceChoisie.telephone}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">
                          Agent : {creanceChoisie.agent} · {creanceChoisie.modePaiementCommande} · commande du {new Date(creanceChoisie.date).toLocaleDateString("fr-FR")}
                        </p>
                        <p className="mt-1 text-xs text-ink">
                          Total {fcfa(creanceChoisie.montantTotal)} · <strong className="text-danger">reste {fcfa(creanceChoisie.reste)}</strong>
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <select className="field-input" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                    {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}

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
                    <input className="field-input" type="number" min={1} placeholder="Cartons" value={cartons} onChange={(e) => setCartons(e.target.value)} required />
                  </div>
                )}

                <input
                  className="field-input"
                  type="number"
                  min={1}
                  max={estEncaissement && creanceChoisie ? creanceChoisie.reste : undefined}
                  placeholder={estAchatStock ? "Coût total de l'achat (FCFA)" : estEncaissement ? "Montant encaissé (FCFA)" : "Montant (FCFA)"}
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  required
                />
                <div className="grid grid-cols-3 gap-1">
                  {(["ESPECES", "ORANGE_MONEY", "MTN_MOMO"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`rounded-md border px-2 py-2 text-xs font-medium transition sm:text-sm ${
                        mode === m ? "border-brass bg-brass text-white" : "border-line text-ink-muted hover:border-brass hover:text-brass"
                      }`}
                    >
                      {MODES[m]}
                    </button>
                  ))}
                </div>
                <input
                  className="field-input"
                  placeholder={estAchatStock || estEncaissement ? "Note (optionnel)" : "Libellé (ex. paiement de M. Nkoulou)"}
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                  required={!estAchatStock && !estEncaissement}
                />
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  Date
                  <input type="date" className="field-input max-w-[170px]" value={date} max={aujourdhui} onChange={(e) => setDate(e.target.value || aujourdhui)} />
                </label>
              </div>

              {estEncaissement && creanceChoisie && montantNum > 0 && (
                <p className="mt-3 rounded-md bg-ok/10 px-3 py-2 text-xs text-ink">
                  Reste dû après cet encaissement : <strong>{fcfa(Math.max(0, creanceChoisie.reste - montantNum))}</strong>
                  {creanceChoisie.reste - montantNum <= 0 && " — la commande sera soldée."}
                </p>
              )}
              {estAchatStock && produitChoisi && Number(cartons) > 0 && (
                <p className="mt-3 rounded-md bg-brass/10 px-3 py-2 text-xs text-ink">
                  Stock de {produitChoisi.nom} : {produitChoisi.cartons} → <strong>{produitChoisi.cartons + (parseInt(cartons, 10) || 0)} cartons</strong>
                  {montantNum > 0 && <> · coût de {fcfa(montantNum / parseInt(cartons, 10))} / carton</>}
                </p>
              )}
              {montantNum > 0 && type === "DEPENSE" && (
                <p className={`mt-2 text-xs ${soldeApres < 0 ? "font-medium text-danger" : "text-ink-muted"}`}>
                  Solde de caisse après l'opération : {fcfa(soldeApres)}
                  {soldeApres < 0 && " — la caisse serait en négatif."}
                </p>
              )}
              {erreur && <p className="mt-2 text-sm text-danger">{erreur}</p>}
              <button className="btn-primary mt-4 w-full" type="submit" disabled={enCours}>
                {enCours ? "Enregistrement…" : estEncaissement ? "Enregistrer l'encaissement" : "Enregistrer l'opération"}
              </button>
            </form>

            {/* Crédits à encaisser + Stock */}
            <div className="space-y-4">
              <div className="field-card">
                <p className="section-eyebrow mb-3">
                  <IconAlert className="h-4 w-4" />
                  Crédits à encaisser ({data.creances.length})
                </p>
                {data.creances.length === 0 ? (
                  <p className="text-sm text-ink-muted">Aucun crédit en cours : toutes les commandes sont soldées.</p>
                ) : (
                  <div className="max-h-[320px] overflow-auto rounded-lg border border-line">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-bg-elevated text-left text-ink-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">Point de vente</th>
                          <th className="px-3 py-2 font-medium">Client</th>
                          <th className="px-3 py-2 text-right font-medium">Reste dû</th>
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.creances.map((c) => (
                          <tr key={c.commandeId} className="border-t border-line">
                            <td className="px-3 py-2">
                              <p className="font-medium text-ink">{c.pointVente}</p>
                              <p className="text-xs text-ink-muted">{c.localisation} · {c.modePaiementCommande}</p>
                            </td>
                            <td className="px-3 py-2 text-ink-muted">{c.client}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-danger">{fcfa(c.reste)}</td>
                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                className="rounded-md border border-brass px-2 py-1 text-xs font-medium text-brass hover:bg-brass hover:text-white"
                                onClick={() => { changerOnglet("ENCAISSEMENT"); choisirCreance(c.commandeId); }}
                              >
                                Encaisser
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="field-card">
                <p className="section-eyebrow mb-3">
                  <IconBox className="h-4 w-4" />
                  Stock présent
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
                  Valeur à la vente : cartons × prix du palier « 1 carton ». Le coût moyen vient des achats de stock saisis ici ou dans l'onglet Stock
                  {data.stock.coutInconnu && " — certains produits n'ont pas encore d'achat enregistré."}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="section-eyebrow">
              <IconReceipt className="h-4 w-4" />
              Journal de caisse
            </p>
            <div className="flex flex-wrap gap-2 no-print">
              <select className="field-input max-w-[200px] py-1.5 text-sm" value={filtreSource} onChange={(e) => setFiltreSource(e.target.value as typeof filtreSource)} aria-label="Nature de l'opération">
                <option value="">Toutes les opérations</option>
                <option value="VENTE">Ventes (commerciaux)</option>
                <option value="CREDIT">Ventes à crédit</option>
                <option value="ENCAISSEMENT">Encaissements de crédit</option>
                <option value="MANUEL">Opérations manuelles</option>
              </select>
              <select className="field-input max-w-[180px] py-1.5 text-sm" value={filtreMode} onChange={(e) => setFiltreMode(e.target.value as typeof filtreMode)} aria-label="Mode de paiement">
                <option value="">Tous les modes</option>
                {(Object.keys(MODES) as Mode[]).map((m) => <option key={m} value={m}>{MODES[m]}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated text-left text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Opération</th>
                  <th className="px-4 py-3 font-medium">Détail</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 text-right font-medium">À crédit</th>
                  <th className="px-4 py-3 text-right font-medium">Recette</th>
                  <th className="px-4 py-3 text-right font-medium">Dépense</th>
                  <th className="px-2 py-3 no-print" />
                </tr>
              </thead>
              <tbody>
                {journal.map((l) => (
                  <tr key={l.id} className="border-t border-line align-top transition-colors hover:bg-bg-elevated">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                      {new Date(l.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${l.source === "VENTE" ? "bg-ok/10 text-ok" : l.source === "ENCAISSEMENT" ? "bg-ok/10 text-ok" : "bg-brass/10 text-brass"}`}>
                        {LIBELLE_CATEGORIE[l.categorie] || l.categorie}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {l.details ? (
                        <>
                          <p className="font-medium text-ink">{l.details.pointVente}</p>
                          <p className="text-xs text-ink-muted">
                            {l.details.localisation} · Client : {l.details.client}
                            {l.details.telephone ? ` (${l.details.telephone})` : ""} · Agent : {l.details.agent}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {l.source === "VENTE"
                              ? `${l.quantiteCartons ?? 0} carton(s) · ${l.details.modePaiementCommande} · total ${fcfa(l.details.montantTotal)}${l.details.reste > 0 ? ` · reste dû ${fcfa(l.details.reste)}` : ""}`
                              : `${l.libelle}${l.details.reste > 0 ? ` · reste dû ${fcfa(l.details.reste)}` : " · commande soldée"}`}
                          </p>
                        </>
                      ) : (
                        <p className="text-ink">{l.libelle}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{l.mode ? MODES[l.mode] : l.credit > 0 ? "Crédit" : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-danger">{l.credit > 0 ? fcfa(l.credit) : ""}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ok">{l.type === "RECETTE" && l.montant > 0 ? fcfa(l.montant) : ""}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-warn">{l.type === "DEPENSE" ? fcfa(l.montant) : ""}</td>
                    <td className="px-2 py-3 text-right no-print">
                      {l.annulable && (
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
                {journal.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">Aucune opération sur cette période.</td>
                  </tr>
                )}
              </tbody>
              {journal.length > 0 && (
                <tfoot className="border-t border-line bg-bg-elevated font-semibold text-ink">
                  <tr>
                    <td className="px-4 py-3" colSpan={4}>Total</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-danger">{fcfa(totauxJournal.credit)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-ok">{fcfa(totauxJournal.recettes)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-warn">{fcfa(totauxJournal.depenses)}</td>
                    <td className="no-print" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {data.resume.tronque && (
            <p className="mt-2 text-xs text-warn no-print">Le journal est limité aux 1 000 dernières lignes ; réduisez la période pour tout voir.</p>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!aSupprimer}
        title="Annuler cette opération ?"
        message={
          aSupprimer?.categorie === "REAPPROVISIONNEMENT"
            ? "Cet achat de stock sera retiré de la caisse et les cartons ajoutés seront retirés du stock."
            : aSupprimer?.categorie === "ENCAISSEMENT_CREDIT"
              ? "Cet encaissement sera retiré de la caisse et la somme redeviendra due sur la commande du commercial."
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
