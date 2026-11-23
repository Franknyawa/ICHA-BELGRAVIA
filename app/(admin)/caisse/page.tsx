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

type Mode = "ESPECES" | "ORANGE_MONEY" | "MTN_MOMO" | "MOBILE_MONEY" | "BANQUE";
type Canal = "ESPECES" | "OM_MOMO" | "BANQUE";
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
type AEncaisser = Details & {
  date: string;
  livreeLe: string | null;
  datePrevue: string | null;
  enRetard: boolean;
  encaisse: number;
};
type LigneJournal = {
  id: string;
  date: string;
  type: "RECETTE" | "DEPENSE";
  categorie: string;
  libelle: string;
  montant: number;
  source: "ENCAISSEMENT" | "TRANSFERT" | "MANUEL";
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
    recettesEncaissements: number;
    nbEncaissements: number;
    recettesAutres: number;
    recettes: number;
    depenses: number;
    solde: number;
    aEncaisser: number;
    nbAEncaisser: number;
    nbEnRetard: number;
    parCanal: Record<Canal, number>;
    tronque: boolean;
  };
  global: {
    recettes: number;
    depenses: number;
    solde: number;
    parCanal: Record<Canal, number>;
    detailMobile: { ORANGE_MONEY: number; MTN_MOMO: number; MOBILE_MONEY: number };
  };
  stock: { lignes: LigneStock[]; totalCartons: number; valeurVente: number; valeurCout: number; coutInconnu: boolean };
  aEncaisser: AEncaisser[];
  journal: LigneJournal[];
};

const MODES: Record<Mode, string> = {
  ESPECES: "Espèces",
  ORANGE_MONEY: "Orange Money",
  MTN_MOMO: "MTN MoMo",
  MOBILE_MONEY: "OM/MOMO",
  BANQUE: "Banque",
};
const CANAUX: Record<Canal, string> = { ESPECES: "Espèces", OM_MOMO: "OM/MOMO", BANQUE: "Opération bancaire" };
const canalDuMode = (m: Mode | null): Canal | null => (m === null ? null : m === "ESPECES" ? "ESPECES" : m === "BANQUE" ? "BANQUE" : "OM_MOMO");

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
  ENCAISSEMENT_COMMANDE: "Encaissement de commande",
  ENCAISSEMENT_CREDIT: "Encaissement de crédit",
  TRANSFERT: "Transfert",
  ...CATEGORIES_RECETTE,
  ...CATEGORIES_DEPENSE,
};

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
const jourFr = (iso: string) => {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
};

type Onglet = "ENCAISSEMENT" | "DEPENSE" | "RECETTE" | "TRANSFERT";

export default function CaissePage() {
  const aujourdhui = aujourdhuiISO();
  const [du, setDu] = useState(aujourdhui);
  const [au, setAu] = useState(aujourdhui);
  const [data, setData] = useState<Donnees | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreurPage, setErreurPage] = useState<string | null>(null);
  const [filtreCanal, setFiltreCanal] = useState<"" | Canal>("");
  const [filtreSource, setFiltreSource] = useState<"" | "ENCAISSEMENT" | "TRANSFERT" | "MANUEL">("");

  // Formulaire
  const [onglet, setOnglet] = useState<Onglet>("ENCAISSEMENT");
  const [categorie, setCategorie] = useState("REAPPROVISIONNEMENT");
  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [produitId, setProduitId] = useState("");
  const [cartons, setCartons] = useState("");
  const [canal, setCanal] = useState<Canal>("ESPECES");
  const [versCanal, setVersCanal] = useState<Canal>("BANQUE");
  const [commandeId, setCommandeId] = useState("");
  const [recherche, setRecherche] = useState("");
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
  const estTransfert = onglet === "TRANSFERT";
  const type: "RECETTE" | "DEPENSE" = onglet === "RECETTE" ? "RECETTE" : onglet === "DEPENSE" ? "DEPENSE" : "RECETTE";
  const categories = onglet === "RECETTE" ? CATEGORIES_RECETTE : CATEGORIES_DEPENSE;
  const estAchatStock = onglet === "DEPENSE" && categorie === "REAPPROVISIONNEMENT";
  const produitChoisi = data?.stock.lignes.find((l) => l.produitId === produitId);
  const commandeChoisie = data?.aEncaisser.find((c) => c.commandeId === commandeId);
  const montantNum = Number(montant) || 0;
  const soldeCanal = data ? data.global.parCanal[canal] : 0;

  const aEncaisserFiltrees = useMemo(() => {
    if (!data) return [];
    const q = recherche.trim().toLowerCase();
    if (!q) return data.aEncaisser;
    return data.aEncaisser.filter((c) => `${c.pointVente} ${c.localisation} ${c.client} ${c.agent}`.toLowerCase().includes(q));
  }, [data, recherche]);
  const enRetard = data?.aEncaisser.filter((c) => c.enRetard) ?? [];
  const aVenir = data?.aEncaisser.filter((c) => !c.enRetard) ?? [];

  function changerOnglet(o: Onglet) {
    setOnglet(o);
    setCategorie(o === "RECETTE" ? "AUTRE_RECETTE" : "REAPPROVISIONNEMENT");
    setErreur(null);
    setMontant("");
  }

  function choisirCommande(id: string) {
    setCommandeId(id);
    const c = data?.aEncaisser.find((x) => x.commandeId === id);
    setMontant(c ? String(c.reste) : "");
    setErreur(null);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (estEncaissement && !commandeId) {
      setErreur("Choisissez la commande à encaisser.");
      return;
    }
    if (estTransfert && canal === versCanal) {
      setErreur("Choisissez deux canaux différents.");
      return;
    }
    setEnCours(true);
    try {
      const corps = estEncaissement
        ? { type: "ENCAISSEMENT", commandeId, montant: montantNum, canal, libelle, date }
        : estTransfert
          ? { type: "TRANSFERT", de: canal, vers: versCanal, montant: montantNum, libelle, date }
          : {
              type,
              categorie,
              montant: montantNum,
              libelle,
              date,
              canal,
              ...(estAchatStock ? { produitId, quantiteCartons: parseInt(cartons, 10) } : {}),
            };
      const res = await fetch("/api/caisse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
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

  // Journal filtré (canal / nature), utilisé à l'écran et dans les exports.
  const journal = useMemo(() => {
    if (!data) return [];
    return data.journal.filter((l) => {
      if (filtreCanal && canalDuMode(l.mode) !== filtreCanal) return false;
      if (filtreSource && l.source !== filtreSource) return false;
      return true;
    });
  }, [data, filtreCanal, filtreSource]);

  // Les transferts déplacent l'argent sans le créer ni le dépenser : hors totaux.
  const totauxJournal = useMemo(() => {
    const hors = journal.filter((l) => l.source !== "TRANSFERT");
    return {
      recettes: hors.filter((l) => l.type === "RECETTE").reduce((s, l) => s + l.montant, 0),
      depenses: hors.filter((l) => l.type === "DEPENSE").reduce((s, l) => s + l.montant, 0),
    };
  }, [journal]);

  const sousTitreExport = () =>
    `${libellePeriode}${filtreCanal ? ` · ${CANAUX[filtreCanal]}` : ""}${filtreSource ? ` · ${{ ENCAISSEMENT: "Encaissements", TRANSFERT: "Transferts", MANUEL: "Opérations manuelles" }[filtreSource]}` : ""} · Résultat : ${fcfa(totauxJournal.recettes - totauxJournal.depenses)}`;

  const canalTexte = (l: LigneJournal) => (l.mode ? CANAUX[canalDuMode(l.mode)!] : "—");
  const ligneExport = (l: LigneJournal) => ({
    date: new Date(l.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }),
    operation: LIBELLE_CATEGORIE[l.categorie] || l.categorie,
    pointVente: l.details?.pointVente || l.libelle,
    localisation: l.details?.localisation || "—",
    client: l.details ? `${l.details.client}${l.details.telephone ? ` (${l.details.telephone})` : ""}` : "—",
    canal: canalTexte(l),
    recette: l.type === "RECETTE" && l.source !== "TRANSFERT" ? l.montant : 0,
    depense: l.type === "DEPENSE" && l.source !== "TRANSFERT" ? l.montant : 0,
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
          { cle: "pointVente", label: "Point de vente / libellé" },
          { cle: "localisation", label: "Localisation" },
          { cle: "client", label: "Client" },
          { cle: "canal", label: "Canal" },
          { cle: "recette", label: "Recette", droite: true, montant: true },
          { cle: "depense", label: "Dépense", droite: true, montant: true },
        ],
        lignes: journal.map(ligneExport),
        totaux: { recette: totauxJournal.recettes, depense: totauxJournal.depenses },
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
        ["Date", "Opération", "Libellé", "Point de vente", "Localisation", "Client", "Téléphone client", "Agent", "Canal", "Montant de la commande", "Reste à encaisser", "Recette", "Dépense", "Transfert (montant)"],
        journal.map((l) => [
          new Date(l.date).toLocaleString("fr-FR"),
          LIBELLE_CATEGORIE[l.categorie] || l.categorie,
          l.libelle,
          l.details?.pointVente || "",
          l.details?.localisation || "",
          l.details?.client || "",
          l.details?.telephone || "",
          l.details?.agent || "",
          canalTexte(l),
          l.details?.montantTotal ?? "",
          l.details?.reste ?? "",
          l.type === "RECETTE" && l.source !== "TRANSFERT" ? l.montant : 0,
          l.type === "DEPENSE" && l.source !== "TRANSFERT" ? l.montant : 0,
          l.source === "TRANSFERT" ? (l.type === "RECETTE" ? l.montant : -l.montant) : "",
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
            {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} — reliée aux commandes livrées et au stock.
            Le solde ne bouge qu'à l'encaissement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={!data || exportEnCours !== null} onClick={exporterPdf}>
            {exportEnCours === "pdf" ? <Spinner className="h-4 w-4" /> : <IconDownload className="h-4 w-4" />}
            PDF
          </button>
          <button className="btn-secondary" disabled={!data || exportEnCours !== null} onClick={exporterCsv}>
            <IconDownload className="h-4 w-4" />
            Excel (CSV)
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
          {/* Soldes cumulés */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 no-print">
            <Kpi label="Solde en caisse (cumul)" valeur={fcfa(data.global.solde)} ton={data.global.solde < 0 ? "danger" : "brass"} fort detail="Encaissements validés + autres recettes − dépenses" />
            {(["ESPECES", "OM_MOMO", "BANQUE"] as Canal[]).map((c) => (
              <Kpi
                key={c}
                label={`Solde ${CANAUX[c] === "Opération bancaire" ? "banque" : CANAUX[c].toLowerCase()}`}
                valeur={fcfa(data.global.parCanal[c])}
                ton={data.global.parCanal[c] < 0 ? "danger" : "ink"}
                detail={
                  c === "OM_MOMO" && (data.global.detailMobile.ORANGE_MONEY || data.global.detailMobile.MTN_MOMO)
                    ? `Orange ${fcfa(data.global.detailMobile.ORANGE_MONEY)} · MTN ${fcfa(data.global.detailMobile.MTN_MOMO)}`
                    : `période : ${data.resume.parCanal[c] >= 0 ? "+" : ""}${fcfa(data.resume.parCanal[c])}`
                }
              />
            ))}
          </div>

          <p className="section-eyebrow mb-3 no-print">{libellePeriode}</p>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 no-print">
            <Kpi
              label="Recettes"
              valeur={fcfa(data.resume.recettes)}
              ton="ok"
              detail={`${data.resume.nbEncaissements} encaissement${data.resume.nbEncaissements > 1 ? "s" : ""} : ${fcfa(data.resume.recettesEncaissements)}`}
            />
            <Kpi label="Dépenses" valeur={fcfa(data.resume.depenses)} ton="warn" detail="achats de stock inclus" />
            <Kpi label="Résultat" valeur={fcfa(data.resume.solde)} ton={data.resume.solde < 0 ? "danger" : "ink"} detail="recettes − dépenses" />
            <Kpi
              label="Commandes à encaisser"
              valeur={fcfa(data.resume.aEncaisser)}
              ton="danger"
              detail={`${data.resume.nbAEncaisser} commande${data.resume.nbAEncaisser > 1 ? "s" : ""} livrée${data.resume.nbAEncaisser > 1 ? "s" : ""}${data.resume.nbEnRetard ? ` · ${data.resume.nbEnRetard} en retard` : ""} · toutes périodes`}
            />
          </div>

          <div className="mb-8 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] no-print">
            {/* Saisie */}
            <form onSubmit={enregistrer} className="field-card">
              <p className="section-eyebrow mb-3">
                <IconPlus className="h-4 w-4" />
                Nouvelle opération
              </p>
              <div className="mb-3 grid grid-cols-4 gap-1 rounded-lg border border-line p-1">
                {([["ENCAISSEMENT", "Encaisser"], ["DEPENSE", "Dépense"], ["RECETTE", "Autre recette"], ["TRANSFERT", "Transfert"]] as const).map(([t, l]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => changerOnglet(t)}
                    className={`rounded-md px-1.5 py-2 text-xs font-medium transition sm:text-sm ${
                      onglet === t ? (t === "DEPENSE" ? "bg-brass text-white" : t === "TRANSFERT" ? "bg-ink text-white" : "bg-ok text-white") : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div className="grid gap-2">
                {estEncaissement && (
                  <>
                    <input
                      className="field-input"
                      placeholder="Rechercher un point de vente, un quartier, un commercial…"
                      value={recherche}
                      onChange={(e) => setRecherche(e.target.value)}
                    />
                    <select className="field-input" value={commandeId} onChange={(e) => choisirCommande(e.target.value)} required>
                      <option value="">
                        {data.aEncaisser.length === 0 ? "Aucune commande livrée à encaisser" : `Choisir la commande à encaisser… (${aEncaisserFiltrees.length})`}
                      </option>
                      {aEncaisserFiltrees.map((c) => (
                        <option key={c.commandeId} value={c.commandeId}>
                          {c.pointVente} — {c.localisation} — reste {fcfa(c.reste)}
                        </option>
                      ))}
                    </select>
                    {commandeChoisie && (
                      <div className="rounded-lg border border-brass/30 bg-brass/5 p-3 text-sm">
                        <p className="font-medium text-ink">{commandeChoisie.pointVente}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                          <IconPin className="h-3.5 w-3.5" /> {commandeChoisie.localisation}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                          <IconUser className="h-3.5 w-3.5" /> Client : {commandeChoisie.client}
                          {commandeChoisie.telephone ? ` · ${commandeChoisie.telephone}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">
                          Commercial : {commandeChoisie.agent} · commande du {new Date(commandeChoisie.date).toLocaleDateString("fr-FR")}
                        </p>
                        <p className="mt-1 text-xs text-ink">
                          Total {fcfa(commandeChoisie.montantTotal)}
                          {commandeChoisie.encaisse > 0 && <> · déjà encaissé {fcfa(commandeChoisie.encaisse)}</>} · <strong className="text-danger">reste {fcfa(commandeChoisie.reste)}</strong>
                        </p>
                      </div>
                    )}
                  </>
                )}
                {!estEncaissement && !estTransfert && (
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
                  max={estEncaissement && commandeChoisie ? commandeChoisie.reste : undefined}
                  placeholder={estAchatStock ? "Coût total de l'achat (FCFA)" : estEncaissement ? "Montant reçu du superviseur (FCFA)" : "Montant (FCFA)"}
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  required
                />

                {estTransfert && <p className="text-xs font-medium text-ink-muted">De</p>}
                <div className="grid grid-cols-3 gap-1">
                  {(Object.keys(CANAUX) as Canal[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCanal(c)}
                      className={`rounded-md border px-2 py-2 text-xs font-medium transition sm:text-sm ${
                        canal === c ? "border-brass bg-brass text-white" : "border-line text-ink-muted hover:border-brass hover:text-brass"
                      }`}
                    >
                      {CANAUX[c]}
                    </button>
                  ))}
                </div>
                {estTransfert && (
                  <>
                    <p className="text-xs font-medium text-ink-muted">Vers</p>
                    <div className="grid grid-cols-3 gap-1">
                      {(Object.keys(CANAUX) as Canal[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setVersCanal(c)}
                          className={`rounded-md border px-2 py-2 text-xs font-medium transition sm:text-sm ${
                            versCanal === c ? "border-brass bg-brass text-white" : "border-line text-ink-muted hover:border-brass hover:text-brass"
                          }`}
                        >
                          {CANAUX[c]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <input
                  className="field-input"
                  placeholder={estAchatStock || estEncaissement || estTransfert ? "Note (optionnel)" : "Libellé (ex. paiement de M. Nkoulou)"}
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                  required={!estAchatStock && !estEncaissement && !estTransfert}
                />
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  Date
                  <input type="date" className="field-input max-w-[170px]" value={date} max={aujourdhui} onChange={(e) => setDate(e.target.value || aujourdhui)} />
                </label>
              </div>

              {estEncaissement && commandeChoisie && montantNum > 0 && (
                <p className="mt-3 rounded-md bg-ok/10 px-3 py-2 text-xs text-ink">
                  Reste à encaisser après cette opération : <strong>{fcfa(Math.max(0, commandeChoisie.reste - montantNum))}</strong>
                  {commandeChoisie.reste - montantNum <= 0 && " — la commande sera soldée."}
                </p>
              )}
              {estAchatStock && produitChoisi && Number(cartons) > 0 && (
                <p className="mt-3 rounded-md bg-brass/10 px-3 py-2 text-xs text-ink">
                  Stock de {produitChoisi.nom} : {produitChoisi.cartons} → <strong>{produitChoisi.cartons + (parseInt(cartons, 10) || 0)} cartons</strong>
                  {montantNum > 0 && <> · coût de {fcfa(montantNum / parseInt(cartons, 10))} / carton</>}
                </p>
              )}
              {(onglet === "DEPENSE" || estTransfert) && montantNum > 0 && (
                <p className={`mt-2 text-xs ${soldeCanal - montantNum < 0 ? "font-medium text-danger" : "text-ink-muted"}`}>
                  Solde {CANAUX[canal].toLowerCase()} après l'opération : {fcfa(soldeCanal - montantNum)}
                  {soldeCanal - montantNum < 0 && (estTransfert ? " — transfert refusé (solde insuffisant)." : " — ce canal serait en négatif.")}
                </p>
              )}
              {erreur && <p className="mt-2 text-sm text-danger">{erreur}</p>}
              <button className="btn-primary mt-4 w-full" type="submit" disabled={enCours}>
                {enCours ? "Enregistrement…" : estEncaissement ? "Encaisser" : estTransfert ? "Effectuer le transfert" : "Enregistrer l'opération"}
              </button>
            </form>

            {/* Commandes à encaisser + Stock */}
            <div className="space-y-4">
              <div className="field-card">
                <p className="section-eyebrow mb-3">
                  <IconAlert className="h-4 w-4" />
                  Commandes à encaisser ({data.aEncaisser.length})
                </p>
                {data.aEncaisser.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    Rien à encaisser. Une commande apparaît ici dès que « Effectuer la livraison » est cliqué dans la page Commandes.
                  </p>
                ) : (
                  <div className="max-h-[420px] space-y-4 overflow-auto">
                    {[
                      { titre: "En retard", liste: enRetard, ton: "text-danger" },
                      { titre: "À encaisser", liste: aVenir, ton: "text-ink" },
                    ]
                      .filter((g) => g.liste.length > 0)
                      .map((g) => (
                        <div key={g.titre}>
                          <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
                            <span className={g.ton}>
                              {g.titre} ({g.liste.length})
                            </span>
                            <span className="text-ink-muted">{fcfa(g.liste.reduce((s, c) => s + c.reste, 0))}</span>
                          </div>
                          <ul className="divide-y divide-line rounded-lg border border-line">
                            {g.liste.map((c) => (
                              <li key={c.commandeId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-ink">{c.pointVente}</p>
                                  <p className="text-xs text-ink-muted">
                                    {c.agent} · commandée le {new Date(c.date).toLocaleDateString("fr-FR")}
                                    {c.encaisse > 0 && ` · déjà encaissé ${fcfa(c.encaisse)}`}
                                  </p>
                                  {c.datePrevue && (
                                    <p className={`flex items-center gap-1 text-xs ${c.enRetard ? "text-danger" : "text-ink-muted"}`}>
                                      <IconCalendar className="h-3 w-3" />
                                      Livraison / encaissement prévu le {new Date(c.datePrevue).toLocaleDateString("fr-FR")}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-shrink-0 items-center gap-2">
                                  <span className="rounded-full bg-brass/10 px-2.5 py-1 text-xs font-semibold text-brass">{fcfa(c.reste)}</span>
                                  <button
                                    type="button"
                                    className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                                    onClick={() => { changerOnglet("ENCAISSEMENT"); choisirCommande(c.commandeId); }}
                                  >
                                    Encaisser
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
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
                <option value="ENCAISSEMENT">Encaissements de commandes</option>
                <option value="TRANSFERT">Transferts</option>
                <option value="MANUEL">Opérations manuelles</option>
              </select>
              <select className="field-input max-w-[200px] py-1.5 text-sm" value={filtreCanal} onChange={(e) => setFiltreCanal(e.target.value as typeof filtreCanal)} aria-label="Canal">
                <option value="">Tous les canaux</option>
                {(Object.keys(CANAUX) as Canal[]).map((c) => <option key={c} value={c}>{CANAUX[c]}</option>)}
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
                  <th className="px-4 py-3 font-medium">Canal</th>
                  <th className="px-4 py-3 text-right font-medium">Recette</th>
                  <th className="px-4 py-3 text-right font-medium">Dépense</th>
                  <th className="px-2 py-3 no-print" />
                </tr>
              </thead>
              <tbody>
                {journal.map((l) => {
                  const transfert = l.source === "TRANSFERT";
                  return (
                    <tr key={l.id} className="border-t border-line align-top transition-colors hover:bg-bg-elevated">
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                        {new Date(l.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${l.source === "ENCAISSEMENT" ? "bg-ok/10 text-ok" : transfert ? "bg-ink/10 text-ink" : "bg-brass/10 text-brass"}`}>
                          {LIBELLE_CATEGORIE[l.categorie] || l.categorie}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {l.details ? (
                          <>
                            <p className="font-medium text-ink">{l.details.pointVente}</p>
                            <p className="text-xs text-ink-muted">
                              {l.details.localisation} · Client : {l.details.client}
                              {l.details.telephone ? ` (${l.details.telephone})` : ""} · Commercial : {l.details.agent}
                            </p>
                            <p className="text-xs text-ink-muted">
                              {l.libelle}
                              {l.details.reste > 0 ? ` · reste à encaisser ${fcfa(l.details.reste)}` : " · commande soldée"}
                            </p>
                          </>
                        ) : (
                          <p className="text-ink">{l.libelle}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{canalTexte(l)}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${transfert ? "text-ink-muted" : "text-ok"}`}>
                        {l.type === "RECETTE" && l.montant > 0 ? fcfa(l.montant) : ""}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${transfert ? "text-ink-muted" : "text-warn"}`}>
                        {l.type === "DEPENSE" ? fcfa(l.montant) : ""}
                      </td>
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
                  );
                })}
                {journal.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">Aucune opération sur cette période.</td>
                  </tr>
                )}
              </tbody>
              {journal.length > 0 && (
                <tfoot className="border-t border-line bg-bg-elevated font-semibold text-ink">
                  <tr>
                    <td className="px-4 py-3" colSpan={4}>Total (hors transferts)</td>
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
            : aSupprimer?.categorie === "ENCAISSEMENT_COMMANDE"
              ? "Cet encaissement sera retiré de la caisse et la somme redeviendra « à encaisser » pour cette commande."
              : aSupprimer?.categorie === "ENCAISSEMENT_CREDIT"
                ? "Cet encaissement sera retiré de la caisse et la somme redeviendra due sur la commande du commercial."
                : aSupprimer?.categorie === "TRANSFERT"
                  ? "Le transfert sera annulé des deux côtés (sortie et entrée)."
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
