"use client";

import { useCallback, useEffect, useState } from "react";
import { IconReceipt, IconCheckCircle, IconClock, IconDownload, IconStorefront, IconAlert } from "@/components/icons";
import { genererBonLivraisonPdf } from "@/lib/bonLivraisonPdf";
import GammeTabs from "@/components/GammeTabs";
import { libelleGamme, styleBadgeGamme, type GammeInfo } from "@/lib/gammesClient";

type Ligne = { id: string; quantite: number; prixUnitaire: string; produit: { nom: string } | null; libelleLibre: string | null };
type Commande = {
  id: string;
  dateCommande: string;
  dateLivraison: string | null;
  statut: "NON_TRAITEE" | "EN_COURS_LIVRAISON" | "LIVREE";
  montantTotal: string;
  modePaiement: string;
  resteAPayer: string;
  observations: string | null;
  pointVente: { nomEtablissement: string; nomVendeur: string | null; telVendeur: string | null; quartier: string | null; ville: { nom: string } | null };
  commercial: { prenom: string; nom: string };
  gamme: GammeInfo | null;
  lignes: Ligne[];
};
type Compteurs = { NON_TRAITEE: number; EN_COURS_LIVRAISON: number; LIVREE: number };

const ONGLETS: { valeur: string; label: string; icon: typeof IconReceipt }[] = [
  { valeur: "", label: "Toutes", icon: IconReceipt },
  { valeur: "NON_TRAITEE", label: "Non traitées", icon: IconAlert },
  { valeur: "EN_COURS_LIVRAISON", label: "En attente", icon: IconClock },
  { valeur: "LIVREE", label: "Livrées", icon: IconCheckCircle },
];

// Pastille de statut — badge coloré plutôt que du texte brut, plus lisible
// en un coup d'œil dans une liste dense.
const STATUT_BADGE: Record<string, string> = {
  NON_TRAITEE: "bg-danger/10 text-danger",
  EN_COURS_LIVRAISON: "bg-brass/10 text-brass",
  LIVREE: "bg-ok/10 text-ok",
};
const STATUT_LABEL: Record<string, string> = {
  NON_TRAITEE: "Non traitée",
  EN_COURS_LIVRAISON: "En cours de livraison",
  LIVREE: "Livrée",
};

export default function CommandesPage() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [total, setTotal] = useState(0);
  const [compteurs, setCompteurs] = useState<Compteurs>({ NON_TRAITEE: 0, EN_COURS_LIVRAISON: 0, LIVREE: 0 });
  const [onglet, setOnglet] = useState("");
  const [gammes, setGammes] = useState<GammeInfo[]>([]);
  const [filtreGamme, setFiltreGamme] = useState("");
  const [nouvelles, setNouvelles] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const params = new URLSearchParams();
    if (onglet) params.set("statut", onglet);
    if (filtreGamme) params.set("gammeId", filtreGamme);
    const res = await fetch(`/api/commandes?${params.toString()}`);
    const data = await res.json();
    setCommandes(data.items || []);
    setTotal(data.total || 0);
    if (data.compteurs) setCompteurs(data.compteurs);
    setChargement(false);
  }, [onglet, filtreGamme]);

  useEffect(() => {
    fetch("/api/gammes").then((r) => r.json()).then((d) => setGammes(d.gammes || []));
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    const source = new EventSource("/api/commandes/stream");
    source.addEventListener("nouvelle-commande", () => setNouvelles((n) => n + 1));
    return () => source.close();
  }, []);

  function rafraichir() {
    setNouvelles(0);
    charger();
  }

  // Bon de livraison — appelable à tout moment tant que la commande est
  // livrée (pas seulement au moment de la validation), ex. si le premier
  // PDF a été perdu ou doit être renvoyé au client.
  async function telechargerBonLivraison(commande: Commande) {
    await genererBonLivraisonPdf({
      numero: commande.id.slice(0, 8).toUpperCase(),
      gammeNom: commande.gamme ? libelleGamme(commande.gamme) : undefined,
      dateLivraison: commande.dateLivraison ? new Date(commande.dateLivraison) : new Date(),
      pointVenteNom: commande.pointVente.nomEtablissement,
      nomVendeur: commande.pointVente.nomVendeur,
      telVendeur: commande.pointVente.telVendeur,
      villeNom: commande.pointVente.ville?.nom,
      quartier: commande.pointVente.quartier,
      commercialNom: `${commande.commercial.prenom} ${commande.commercial.nom}`,
      lignes: commande.lignes.map((l) => ({
        produitNom: l.produit?.nom || l.libelleLibre || "Produit",
        quantiteCartons: l.quantite,
      })),
      montantTotal: Number(commande.montantTotal),
      modePaiement: commande.modePaiement,
      resteAPayer: Number(commande.resteAPayer),
    });
  }

  async function changerStatut(id: string, statut: string, commande: Commande) {
    setEnCours(id);
    try {
      const res = await fetch(`/api/commandes/${id}/statut`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut }),
      });
      if (res.ok) {
        if (statut === "LIVREE") {
          // Bon de livraison généré et téléchargé automatiquement dès la
          // confirmation de livraison — peut être retéléchargé ensuite à
          // tout moment via le bouton "Bon de livraison" de la commande.
          try {
            await telechargerBonLivraison(commande);
          } catch {
            /* le changement de statut a réussi ; le bon peut être régénéré manuellement si besoin */
          }
        }
        charger();
      }
    } finally {
      setEnCours(null);
    }
  }

  const montantTotalGeneral = commandes.reduce((s, c) => s + Number(c.montantTotal), 0);
  const totalToutesCommandes = compteurs.NON_TRAITEE + compteurs.EN_COURS_LIVRAISON + compteurs.LIVREE;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
            <IconReceipt className="h-5 w-5 text-brass" />
            Commandes
          </h1>
          <p className="text-sm text-ink-muted">{total} commande(s) au total</p>
        </div>
        {nouvelles > 0 && (
          <button onClick={rafraichir} className="btn-primary animate-pulse">
            {nouvelles} nouvelle{nouvelles > 1 ? "s" : ""} commande{nouvelles > 1 ? "s" : ""} — actualiser
          </button>
        )}
      </div>

      {/* Bandeau de synthèse — vue d'ensemble immédiate avant de filtrer. */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="field-card flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <IconAlert className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">{compteurs.NON_TRAITEE}</p>
            <p className="text-xs text-ink-muted">Non traitées</p>
          </div>
        </div>
        <div className="field-card flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
            <IconClock className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">{compteurs.EN_COURS_LIVRAISON}</p>
            <p className="text-xs text-ink-muted">En cours de livraison</p>
          </div>
        </div>
        <div className="field-card flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ok/10 text-ok">
            <IconCheckCircle className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">{compteurs.LIVREE}</p>
            <p className="text-xs text-ink-muted">Livrées</p>
          </div>
        </div>
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
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                actif
                  ? "bg-brass text-bg shadow-[0_2px_10px_-2px_rgb(var(--color-brass)/0.55)]"
                  : "border border-line text-ink-muted hover:border-brass/50 hover:text-brass"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {o.label} ({count})
            </button>
          );
        })}
      </div>

      {!chargement && commandes.length > 0 && (
        <p className="mb-4 text-sm text-ink-muted">
          Montant affiché (filtre courant) :{" "}
          <span className="font-semibold text-ink">{montantTotalGeneral.toLocaleString("fr-FR")} FCFA</span>
        </p>
      )}

      {chargement && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="field-card h-28 animate-pulse bg-bg-elevated/60" />
          ))}
        </div>
      )}

      <div className="space-y-3">
        {!chargement &&
          commandes.map((c) => (
            <div key={c.id} className="field-card transition-shadow hover:shadow-md">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
                    <IconStorefront className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="font-medium text-ink">{c.pointVente.nomEtablissement}</p>
                    <p className="text-xs text-ink-muted">
                      {c.pointVente.ville?.nom} · {c.commercial.prenom} {c.commercial.nom} ·{" "}
                      {new Date(c.dateCommande).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      {c.dateLivraison && ` · Livraison prévue le ${new Date(c.dateLivraison).toLocaleDateString("fr-FR")}`}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUT_BADGE[c.statut]}`}>
                        {STATUT_LABEL[c.statut]}
                      </span>
                      {c.gamme && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styleBadgeGamme(c.gamme.code)}`}>
                          {libelleGamme(c.gamme)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-display text-xl text-ink">{Number(c.montantTotal).toLocaleString("fr-FR")} FCFA</span>
                  <div className="flex items-center gap-2">
                    {c.statut === "NON_TRAITEE" && (
                      <button
                        className="btn-primary"
                        disabled={enCours === c.id}
                        onClick={() => changerStatut(c.id, "EN_COURS_LIVRAISON", c)}
                      >
                        <IconCheckCircle className="h-4 w-4" />
                        {enCours === c.id ? "…" : "Valider"}
                      </button>
                    )}
                    {c.statut === "EN_COURS_LIVRAISON" && (
                      <button
                        className="btn-secondary"
                        disabled={enCours === c.id}
                        onClick={() => changerStatut(c.id, "LIVREE", c)}
                      >
                        <IconClock className="h-4 w-4" />
                        {enCours === c.id ? "…" : "Marquer livrée"}
                      </button>
                    )}
                    {c.statut === "LIVREE" && (
                      <button className="btn-secondary" onClick={() => telechargerBonLivraison(c)}>
                        <IconDownload className="h-4 w-4" />
                        Bon de livraison
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <ul className="space-y-1 border-t border-line pt-2 text-sm">
                {c.lignes.map((l) => (
                  <li key={l.id} className="flex justify-between text-ink-muted">
                    <span>
                      {l.quantite} × {l.produit?.nom || l.libelleLibre}
                    </span>
                    <span>{(l.quantite * Number(l.prixUnitaire)).toLocaleString("fr-FR")}</span>
                  </li>
                ))}
              </ul>
              {Number(c.resteAPayer) > 0 && (
                <p className="mt-2 text-sm font-medium text-danger">
                  Reste à payer : {Number(c.resteAPayer).toLocaleString("fr-FR")} FCFA
                </p>
              )}
              {c.observations && <p className="mt-2 text-sm text-ink-muted">Note : {c.observations}</p>}
            </div>
          ))}
        {!chargement && commandes.length === 0 && (
          <div className="field-card flex flex-col items-center gap-2 py-14 text-center">
            <IconReceipt className="h-6 w-6 text-ink-muted" />
            <p className="text-sm text-ink-muted">Aucune commande pour ce filtre.</p>
          </div>
        )}
      </div>
    </div>
  );
}
