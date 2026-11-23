"use client";

import { nombreFr } from "@/lib/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEcriture } from "@/lib/useEcriture";
import { usePolling } from "@/lib/usePolling";
import {
  IconReceipt,
  IconCheckCircle,
  IconClock,
  IconDownload,
  IconStorefront,
  IconAlert,
  IconPhone,
  IconPencil,
  IconRefresh,
  IconCopy,
  IconCalendar,
} from "@/components/icons";
import { genererBonLivraisonPdf } from "@/lib/bonLivraisonPdf";
import { genererFacturePdf } from "@/lib/facturePdf";
import GammeTabs from "@/components/GammeTabs";
import ConfirmDialog from "@/components/ConfirmDialog";
import ModaleCommande from "@/components/ModaleCommande";
import { libelleGamme, styleBadgeGamme, type GammeInfo } from "@/lib/gammesClient";
import { Spinner } from "@/components/Spinner";
import { aujourdhuiISO, ajouterJours } from "@/lib/dates";

type Ligne = { id: string; quantite: number; prixUnitaire: string; produit: { nom: string } | null; libelleLibre: string | null };
type Commande = {
  id: string;
  dateCommande: string;
  dateLivraison: string | null;
  livreeLe: string | null;
  statut: "NON_TRAITEE" | "EN_COURS_LIVRAISON" | "LIVREE";
  montantTotal: string;
  modePaiement: string;
  operateurMobile: string | null;
  resteAPayer: string;
  montantRecu?: string;
  observations: string | null;
  pointVente: {
    nomEtablissement: string;
    nomVendeur: string | null;
    telVendeur: string | null;
    nomPatron: string | null;
    telPatron: string | null;
    quartier: string | null;
    ville: { nom: string } | null;
  };
  commercial: { prenom: string; nom: string };
  gamme: GammeInfo | null;
  lignes: Ligne[];
};
type Compteurs = { NON_TRAITEE: number; EN_COURS_LIVRAISON: number; LIVREE: number };

const ONGLETS: { valeur: string; label: string; icon: typeof IconReceipt }[] = [
  { valeur: "", label: "Toutes", icon: IconReceipt },
  { valeur: "NON_TRAITEE", label: "Non traitées", icon: IconAlert },
  { valeur: "EN_COURS_LIVRAISON", label: "À livrer", icon: IconClock },
  { valeur: "LIVREE", label: "Livrées", icon: IconCheckCircle },
];

// Un style par statut : une commande livrée se reconnaît au premier coup d'œil (vert),
// une commande validée à livrer est dorée, une commande à traiter reste neutre avec un liseré rouge.
const STYLE_CARTE: Record<string, string> = {
  NON_TRAITEE: "border-line bg-bg-card border-l-[5px] border-l-danger",
  EN_COURS_LIVRAISON: "border-brass/40 bg-brass/[0.07] border-l-[5px] border-l-brass",
  LIVREE: "border-ok/50 bg-ok/[0.12] border-l-[5px] border-l-ok",
};
const STYLE_BADGE: Record<string, string> = {
  NON_TRAITEE: "bg-danger/10 text-danger",
  EN_COURS_LIVRAISON: "bg-brass text-white",
  LIVREE: "bg-ok text-white",
};
const LIBELLE_STATUT: Record<string, string> = {
  NON_TRAITEE: "Non traitée",
  EN_COURS_LIVRAISON: "Validée — à livrer",
  LIVREE: "Livrée",
};

const fcfa = nombreFr;
const jourCameroun = (iso: string) => new Date(new Date(iso).getTime() + 3600_000).toISOString().slice(0, 10);
const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" });
const heureFr = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Douala" });

/** Valeur affichée dans le sélecteur de paiement : espèces, Orange, MTN (ou mobile non précisé). */
function modeAffiche(c: Commande) {
  if (c.modePaiement === "ESPECES") return "ESPECES";
  if (c.modePaiement === "MOBILE_MONEY") return c.operateurMobile === "ORANGE_MONEY" || c.operateurMobile === "MTN_MOMO" ? c.operateurMobile : "MOBILE_MONEY";
  return c.modePaiement; // crédit
}

function Pastille({ ton, children }: { ton: "ok" | "warn" | "brass"; children: React.ReactNode }) {
  const t = { ok: "bg-ok/15 text-ok", warn: "bg-warn/20 text-warn", brass: "bg-brass/15 text-brass" }[ton];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${t}`}>{children}</span>;
}

export default function CommandesPage() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [compteurs, setCompteurs] = useState<Compteurs>({ NON_TRAITEE: 0, EN_COURS_LIVRAISON: 0, LIVREE: 0 });
  const [onglet, setOnglet] = useState("");
  const [gammes, setGammes] = useState<GammeInfo[]>([]);
  const [filtreGamme, setFiltreGamme] = useState("");
  const [nouvelles, setNouvelles] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [plusEnCours, setPlusEnCours] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [datesPrevues, setDatesPrevues] = useState<Record<string, string>>({});
  const [aModifier, setAModifier] = useState<Commande | null>(null);
  const [aSupprimer, setASupprimer] = useState<Commande | null>(null);
  const ecriture = useEcriture("commandes");

  // Chargement d'une page : la 1re remplace la liste, les suivantes s'ajoutent.
  const charger = useCallback(
    async (p = 1) => {
      if (p === 1) setChargement(true);
      else setPlusEnCours(true);
      try {
        const params = new URLSearchParams({ page: String(p) });
        if (onglet) params.set("statut", onglet);
        if (filtreGamme) params.set("gammeId", filtreGamme);
        const res = await fetch(`/api/commandes?${params.toString()}`);
        const data = await res.json();
        setCommandes((cur) => (p === 1 ? data.items || [] : [...cur, ...(data.items || [])]));
        setTotal(data.total || 0);
        setPage(p);
        if (data.compteurs) setCompteurs(data.compteurs);
      } finally {
        setChargement(false);
        setPlusEnCours(false);
      }
    },
    [onglet, filtreGamme]
  );

  useEffect(() => {
    fetch("/api/gammes").then((r) => r.json()).then((d) => setGammes(d.gammes || []));
  }, []);

  useEffect(() => {
    charger(1);
  }, [charger]);

  // Nouvelles commandes : sondage léger toutes les 20 s (onglet visible).
  const depuisRef = useRef<string | null>(null);
  async function sonder() {
    const res = await fetch(`/api/live${depuisRef.current ? `?since=${encodeURIComponent(depuisRef.current)}` : ""}`);
    if (!res.ok) return;
    const d = await res.json();
    if (depuisRef.current && d.commandes > 0) setNouvelles((n) => n + d.commandes);
    depuisRef.current = d.maintenant;
  }
  useEffect(() => {
    sonder();
  }, []);
  usePolling(sonder, 20000);

  function rafraichir() {
    depuisRef.current = null;
    sonder();
    setNouvelles(0);
    charger(1);
  }

  async function appeler(url: string, init: RequestInit, id: string) {
    setEnCours(id);
    setErreur(null);
    try {
      const res = await fetch(url, init);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreur(d.error || "Action impossible.");
        return false;
      }
      await charger(1);
      return true;
    } finally {
      setEnCours(null);
    }
  }

  const patch = (id: string, corps: object) =>
    appeler(`/api/commandes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }, id);

  // --- Documents PDF ------------------------------------------------------
  async function telechargerBonLivraison(c: Commande) {
    await genererBonLivraisonPdf({
      numero: c.id.slice(0, 8).toUpperCase(),
      gammeNom: c.gamme ? libelleGamme(c.gamme) : undefined,
      dateLivraison: c.livreeLe ? new Date(c.livreeLe) : c.dateLivraison ? new Date(c.dateLivraison) : new Date(),
      pointVenteNom: c.pointVente.nomEtablissement,
      nomVendeur: c.pointVente.nomVendeur,
      telVendeur: c.pointVente.telVendeur,
      villeNom: c.pointVente.ville?.nom,
      quartier: c.pointVente.quartier,
      commercialNom: `${c.commercial.prenom} ${c.commercial.nom}`,
      lignes: c.lignes.map((l) => ({ produitNom: l.produit?.nom || l.libelleLibre || "Produit", quantiteCartons: l.quantite })),
      montantTotal: Number(c.montantTotal),
      modePaiement: c.modePaiement,
      resteAPayer: Number(c.resteAPayer),
    });
  }

  // Facture et bon de commande : même document, titre différent.
  async function telechargerFacture(c: Commande, titre?: string) {
    await genererFacturePdf({
      titre,
      numero: c.id.slice(0, 8).toUpperCase(),
      date: new Date(c.dateCommande),
      gammeNom: c.gamme ? libelleGamme(c.gamme) : undefined,
      pointVenteNom: c.pointVente.nomEtablissement,
      villeNom: c.pointVente.ville?.nom,
      quartier: c.pointVente.quartier,
      commercialNom: `${c.commercial.prenom} ${c.commercial.nom}`,
      lignes: c.lignes.map((l) => ({
        produitNom: l.produit?.nom || l.libelleLibre || "Produit",
        quantiteCartons: l.quantite,
        prixCarton: Number(l.prixUnitaire),
        sousTotal: l.quantite * Number(l.prixUnitaire),
      })),
      montantTotal: Number(c.montantTotal),
      modePaiement: c.modePaiement,
      montantRecu: Number(c.montantRecu ?? 0),
      resteAPayer: Number(c.resteAPayer),
    });
  }

  async function changerStatut(c: Commande, statut: string, dateLivraison?: string) {
    const ok = await appeler(
      `/api/commandes/${c.id}/statut`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statut, ...(dateLivraison ? { dateLivraison } : {}) }) },
      c.id
    );
    // Aucun document n'est téléchargé automatiquement : bon de commande, bon de livraison et facture
    // se téléchargent à la demande avec les boutons de la carte.
    void ok;
  }

  async function annulerDoublon() {
    if (!aSupprimer) return;
    const c = aSupprimer;
    setASupprimer(null);
    await appeler(`/api/commandes/${c.id}`, { method: "DELETE" }, c.id);
  }

  const totalToutesCommandes = compteurs.NON_TRAITEE + compteurs.EN_COURS_LIVRAISON + compteurs.LIVREE;

  // Regroupement par jour de commande (heure du Cameroun), le plus récent d'abord.
  const groupes = useMemo(() => {
    const m = new Map<string, Commande[]>();
    for (const c of commandes) {
      const k = jourCameroun(c.dateCommande);
      m.set(k, [...(m.get(k) || []), c]);
    }
    return [...m.entries()].map(([jour, liste]) => ({ jour, liste, somme: liste.reduce((s, c) => s + Number(c.montantTotal), 0) }));
  }, [commandes]);

  const aujourdhui = aujourdhuiISO();
  const titreJour = (j: string, n: number) =>
    j === aujourdhui
      ? `Commandes du jour (${n})`
      : j === ajouterJours(aujourdhui, -1)
        ? `Hier (${n})`
        : `${new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} (${n})`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
            <IconReceipt className="h-5 w-5 text-brass" />
            Commandes
          </h1>
          <p className="text-sm text-ink-muted">
            <span className="montant text-base text-ink">{total}</span> commande{total > 1 ? "s" : ""} au total
          </p>
        </div>
        {nouvelles > 0 && (
          <button onClick={rafraichir} className="btn-primary animate-pulse">
            {nouvelles} nouvelle{nouvelles > 1 ? "s" : ""} commande{nouvelles > 1 ? "s" : ""} — actualiser
          </button>
        )}
      </div>

      {/* Synthèse : trois chiffres clés. */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { n: compteurs.NON_TRAITEE, l: "Non traitées", i: IconAlert, c: "bg-danger/10 text-danger" },
          { n: compteurs.EN_COURS_LIVRAISON, l: "À livrer", i: IconClock, c: "bg-brass/15 text-brass" },
          { n: compteurs.LIVREE, l: "Livrées", i: IconCheckCircle, c: "bg-ok/15 text-ok" },
        ].map((k) => (
          <div key={k.l} className="field-card flex items-center gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${k.c}`}>
              <k.i className="h-5 w-5" />
            </span>
            <div>
              <p className="montant text-2xl text-ink">{k.n}</p>
              <p className="text-xs font-semibold text-ink-muted">{k.l}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-3">
        <GammeTabs gammes={gammes} value={filtreGamme} onChange={setFiltreGamme} />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {ONGLETS.map((o) => {
          const Icon = o.icon;
          const count = o.valeur ? compteurs[o.valeur as keyof Compteurs] : totalToutesCommandes;
          const actif = onglet === o.valeur;
          return (
            <button
              key={o.valeur}
              onClick={() => setOnglet(o.valeur)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-all ${
                actif ? "bg-brass text-bg shadow-[0_2px_10px_-2px_rgb(var(--color-brass)/0.55)]" : "border border-line text-ink-muted hover:border-brass/50 hover:text-brass"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {o.label} ({count})
            </button>
          );
        })}
      </div>

      {erreur && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {erreur}
        </div>
      )}

      {/* Squelette immédiat plutôt qu'une page vide pendant le chargement. */}
      {chargement && (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement des commandes">
          {[0, 1, 2].map((i) => (
            <div key={i} className="field-card animate-pulse space-y-3">
              <div className="h-5 w-1/3 rounded bg-bg-elevated" />
              <div className="h-4 w-1/2 rounded bg-bg-elevated" />
              <div className="h-8 w-2/3 rounded bg-bg-elevated" />
            </div>
          ))}
        </div>
      )}

      {!chargement &&
        groupes.map((g) => (
          <section key={g.jour} className="mb-6">
            <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-ink">{titreJour(g.jour, g.liste.length)}</h2>
              <p className="montant text-lg text-ink">
                {fcfa(g.somme)}
                <span className="montant-unite">FCFA</span>
              </p>
            </div>
            <div className="space-y-3">
              {g.liste.map((c) => {
                const tel = c.pointVente.telVendeur || c.pointVente.telPatron;
                const contact = c.pointVente.nomVendeur || c.pointVente.nomPatron;
                const prevue = c.dateLivraison ? jourCameroun(c.dateLivraison) : null;
                const occupe = enCours === c.id;
                const mode = modeAffiche(c);
                const credit = c.modePaiement === "CREDIT_PARTIEL" || c.modePaiement === "CREDIT_TOTAL";
                return (
                  <article key={c.id} className={`rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md sm:px-4 ${STYLE_CARTE[c.statut]}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${c.statut === "LIVREE" ? "bg-ok/20 text-ok" : "bg-brass/10 text-brass"}`}>
                          <IconStorefront className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-menu text-base font-extrabold leading-tight text-ink">{c.pointVente.nomEtablissement}</h3>
                          {contact && (
                            <p className="text-[13px] font-bold text-ink">
                              <span className="font-semibold text-ink-muted">Vendeur / répondant : </span>
                              {contact}
                            </p>
                          )}
                          <p className="text-xs font-medium text-ink-muted">
                            {[c.pointVente.ville?.nom, c.pointVente.quartier].filter(Boolean).join(" · ")} · {c.commercial.prenom} {c.commercial.nom}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${STYLE_BADGE[c.statut]}`}>
                          {c.statut === "LIVREE" && <IconCheckCircle className="h-3.5 w-3.5" />}
                          {LIBELLE_STATUT[c.statut]}
                        </span>
                        {c.gamme && (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styleBadgeGamme(c.gamme.code)}`}>{libelleGamme(c.gamme)}</span>
                        )}
                      </div>
                    </div>

                    {/* Produits */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.lignes.map((l) => (
                        <span key={l.id} className="inline-flex items-center rounded-md bg-bg-card/80 px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-line">
                          {l.produit?.nom || l.libelleLibre} <span className="montant ml-1.5 text-sm text-brass">× {l.quantite}</span>
                        </span>
                      ))}
                    </div>

                    {/* Montant + paiement + téléphone */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <p className="montant text-2xl text-ink">
                        {fcfa(c.montantTotal)}
                        <span className="montant-unite">FCFA</span>
                      </p>
                      {ecriture && !credit ? (
                        <select
                          aria-label="Mode de paiement"
                          value={mode}
                          disabled={occupe}
                          onChange={(e) => patch(c.id, { action: "MODE", modePaiement: e.target.value })}
                          className="field-input w-auto py-1.5 text-sm font-semibold"
                        >
                          <option value="ESPECES">Espèces</option>
                          <option value="ORANGE_MONEY">Orange Money</option>
                          <option value="MTN_MOMO">MTN MoMo</option>
                          {mode === "MOBILE_MONEY" && <option value="MOBILE_MONEY" disabled>Mobile Money</option>}
                        </select>
                      ) : (
                        <span className="rounded-lg bg-bg-card/80 px-2.5 py-1.5 text-sm font-bold text-ink ring-1 ring-line">
                          {{ ESPECES: "Espèces", ORANGE_MONEY: "Orange Money", MTN_MOMO: "MTN MoMo", MOBILE_MONEY: "Mobile Money", CREDIT_PARTIEL: "Crédit partiel", CREDIT_TOTAL: "Crédit total" }[mode] || mode}
                        </span>
                      )}
                      {tel && (
                        <a href={`tel:${tel.replace(/\s/g, "")}`} aria-label={`Appeler ${contact || c.pointVente.nomEtablissement}`} title={tel} className="flex h-8 w-8 items-center justify-center rounded-full bg-ok/15 text-ok hover:bg-ok hover:text-white">
                          <IconPhone className="h-4 w-4" />
                        </a>
                      )}
                      {Number(c.resteAPayer) > 0 && (
                        <span className="text-sm font-bold text-danger">
                          Reste déclaré à payer : <span className="montant text-base">{fcfa(c.resteAPayer)}</span> FCFA
                        </span>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="mt-1.5 space-y-0 text-xs font-medium text-ink-muted">
                      <p>Commandée le {heureFr(c.dateCommande)}</p>
                      {prevue && (
                        <p className="flex flex-wrap items-center gap-1.5">
                          <IconCalendar className="h-3.5 w-3.5" />
                          Livraison prévue le {dateFr(c.dateLivraison!)}
                          {prevue === aujourdhui && <Pastille ton="warn">Aujourd'hui</Pastille>}
                          {prevue < aujourdhui && c.statut !== "LIVREE" && <Pastille ton="warn">En retard</Pastille>}
                        </p>
                      )}
                      {c.statut === "LIVREE" && c.livreeLe && <p className="font-bold text-ok">Livrée le {heureFr(c.livreeLe)}</p>}
                      {c.observations && <p className="text-ink">Note : {c.observations}</p>}
                    </div>

                    {/* Actions */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-2.5 [&_.btn-primary]:px-3 [&_.btn-primary]:py-1.5 [&_.btn-primary]:text-sm [&_.btn-secondary]:px-2.5 [&_.btn-secondary]:py-1.5 [&_.btn-secondary]:text-xs">
                      {ecriture && c.statut === "NON_TRAITEE" && (
                        <>
                          <label className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                            Livraison prévue
                            <input
                              type="date"
                              className="field-input w-[11.5rem] py-1.5"
                              value={datesPrevues[c.id] ?? (c.dateLivraison ? c.dateLivraison.slice(0, 10) : "")}
                              onChange={(e) => setDatesPrevues((d) => ({ ...d, [c.id]: e.target.value }))}
                            />
                          </label>
                          <button className="btn-primary" disabled={occupe} onClick={() => changerStatut(c, "EN_COURS_LIVRAISON", datesPrevues[c.id] || (c.dateLivraison ? c.dateLivraison.slice(0, 10) : undefined))}>
                            {occupe ? <Spinner className="h-4 w-4" /> : <IconCheckCircle className="h-4 w-4" />}
                            Valider et autoriser la livraison
                          </button>
                        </>
                      )}
                      {ecriture && c.statut === "EN_COURS_LIVRAISON" && (
                        <button className="btn-primary" disabled={occupe} onClick={() => changerStatut(c, "LIVREE")}>
                          {occupe ? <Spinner className="h-4 w-4" /> : <IconClock className="h-4 w-4" />}
                          Effectuer la livraison
                        </button>
                      )}
                      {ecriture && (
                        <button className="btn-secondary" disabled={occupe} onClick={() => setAModifier(c)}>
                          <IconPencil className="h-4 w-4" />
                          Modifier
                        </button>
                      )}
                      {ecriture && (c.statut === "LIVREE" || c.statut === "EN_COURS_LIVRAISON") && (
                        <button className="btn-secondary" disabled={occupe} onClick={() => patch(c.id, { action: "REACTIVER" })} title="Remettre la commande à l'état « à traiter »">
                          <IconRefresh className="h-4 w-4" />
                          Réactiver
                        </button>
                      )}
                      {ecriture && c.statut === "LIVREE" && (
                        <button className="btn-secondary !text-[rgb(126,34,206)]" disabled={occupe} onClick={() => setASupprimer(c)}>
                          <IconCopy className="h-4 w-4" />
                          Doublon livré
                        </button>
                      )}
                      <span className="ml-auto flex flex-wrap gap-1.5">
                        {c.statut !== "NON_TRAITEE" && (
                          <>
                            <button className="btn-secondary" onClick={() => telechargerFacture(c, "BON DE COMMANDE")}>
                              <IconReceipt className="h-4 w-4" />
                              Bon de commande
                            </button>
                            <button className="btn-secondary" onClick={() => telechargerBonLivraison(c)}>
                              <IconDownload className="h-4 w-4" />
                              Bon de livraison
                            </button>
                            <button className="btn-secondary" onClick={() => telechargerFacture(c)}>
                              <IconDownload className="h-4 w-4" />
                              Facture
                            </button>
                          </>
                        )}
                      </span>
                    </div>

                  </article>
                );
              })}
            </div>
          </section>
        ))}

      {!chargement && commandes.length === 0 && (
        <div className="field-card flex flex-col items-center gap-2 py-14 text-center">
          <IconReceipt className="h-6 w-6 text-ink-muted" />
          <p className="text-sm text-ink-muted">Aucune commande pour ce filtre.</p>
        </div>
      )}

      {!chargement && commandes.length < total && (
        <div className="mt-2 flex justify-center">
          <button className="btn-secondary" disabled={plusEnCours} onClick={() => charger(page + 1)}>
            {plusEnCours ? <Spinner className="h-4 w-4" /> : null}
            Afficher plus ({total - commandes.length} restantes)
          </button>
        </div>
      )}

      {aModifier && (
        <ModaleCommande
          commandeId={aModifier.id}
          nom={aModifier.pointVente.nomEtablissement}
          onFermer={() => setAModifier(null)}
          onEnregistre={() => {
            setAModifier(null);
            charger(1);
          }}
        />
      )}

      <ConfirmDialog
        open={!!aSupprimer}
        title="Annuler ce doublon livré ?"
        message={`La commande de ${aSupprimer?.pointVente.nomEtablissement ?? ""} (${aSupprimer ? fcfa(aSupprimer.montantTotal) : ""} FCFA) sera supprimée et ses cartons seront remis en stock. Cette action est définitive.`}
        confirmLabel="Annuler le doublon"
        cancelLabel="Garder"
        onConfirm={annulerDoublon}
        onCancel={() => setASupprimer(null)}
      />
    </div>
  );
}
