"use client";

import { useCallback, useEffect, useState } from "react";
import { IconReceipt, IconCheckCircle, IconClock } from "@/components/icons";
import { genererBonLivraisonPdf } from "@/lib/bonLivraisonPdf";

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
  lignes: Ligne[];
};
type Compteurs = { NON_TRAITEE: number; EN_COURS_LIVRAISON: number; LIVREE: number };

const ONGLETS: { valeur: string; label: string }[] = [
  { valeur: "", label: "Toutes" },
  { valeur: "NON_TRAITEE", label: "Non traitées" },
  { valeur: "EN_COURS_LIVRAISON", label: "En attente (livraison)" },
  { valeur: "LIVREE", label: "Livrées" },
];

const STATUT_STYLE: Record<string, string> = {
  NON_TRAITEE: "text-danger",
  EN_COURS_LIVRAISON: "text-brass",
  LIVREE: "text-ok",
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
  const [nouvelles, setNouvelles] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const params = new URLSearchParams();
    if (onglet) params.set("statut", onglet);
    const res = await fetch(`/api/commandes?${params.toString()}`);
    const data = await res.json();
    setCommandes(data.items || []);
    setTotal(data.total || 0);
    if (data.compteurs) setCompteurs(data.compteurs);
    setChargement(false);
  }, [onglet]);

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
          // confirmation de livraison — mêmes infos que la commande.
          try {
            await genererBonLivraisonPdf({
              numero: commande.id.slice(0, 8).toUpperCase(),
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

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
            <IconReceipt className="h-5 w-5 text-brass" />
            Commandes
          </h1>
          <p className="text-sm text-ink-muted">{total} commande(s)</p>
        </div>
        {nouvelles > 0 && (
          <button onClick={rafraichir} className="btn-primary">
            {nouvelles} nouvelle{nouvelles > 1 ? "s" : ""} commande{nouvelles > 1 ? "s" : ""} — actualiser
          </button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {ONGLETS.map((o) => (
          <button
            key={o.valeur}
            onClick={() => setOnglet(o.valeur)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              onglet === o.valeur ? "bg-brass text-white" : "border border-line text-ink-muted hover:border-brass/50"
            }`}
          >
            {o.label}
            {o.valeur && ` (${compteurs[o.valeur as keyof Compteurs]})`}
          </button>
        ))}
      </div>

      {!chargement && commandes.length > 0 && (
        <p className="mb-4 text-sm text-ink-muted">
          Montant total (page courante) :{" "}
          <span className="font-semibold text-ink">{montantTotalGeneral.toLocaleString("fr-FR")}</span>
        </p>
      )}

      <div className="space-y-3">
        {commandes.map((c) => (
          <div key={c.id} className="field-card">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink">{c.pointVente.nomEtablissement}</p>
                <p className="text-xs text-ink-muted">
                  {c.pointVente.ville?.nom} · {c.commercial.prenom} {c.commercial.nom} ·{" "}
                  {new Date(c.dateCommande).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  {c.dateLivraison && ` · Livraison prévue le ${new Date(c.dateLivraison).toLocaleDateString("fr-FR")}`}
                </p>
                <p className={`mt-1 text-xs font-semibold ${STATUT_STYLE[c.statut]}`}>{STATUT_LABEL[c.statut]}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display text-xl text-ink">{Number(c.montantTotal).toLocaleString("fr-FR")}</span>
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
          <p className="field-card text-center text-sm text-ink-muted">Aucune commande pour ce filtre.</p>
        )}
      </div>
    </div>
  );
}
