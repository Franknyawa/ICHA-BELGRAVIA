"use client";

import { useState } from "react";
import { IconDownload } from "@/components/icons";
import { genererFacturePdf } from "@/lib/facturePdf";
import { libelleGamme } from "@/lib/gammesClient";

type Ligne = { produit: { nom: string } | null; quantite: number; prixUnitaire: string; sousTotal: string };
type Commande = {
  id: string;
  createdAt: string;
  montantTotal: string;
  modePaiement: string;
  montantRecu: string;
  resteAPayer: string;
  pointVente: { nomEtablissement: string; quartier: string | null; ville: { nom: string } | null };
  commercial: { nom: string; prenom: string };
  gamme?: { code: string; nom: string } | null;
  lignes: Ligne[];
};

export default function FactureButton({ commande }: { commande: Commande }) {
  const [enCours, setEnCours] = useState(false);

  async function telecharger() {
    setEnCours(true);
    try {
      await genererFacturePdf({
        numero: commande.id.slice(0, 8).toUpperCase(),
        date: new Date(commande.createdAt),
        gammeNom: commande.gamme ? libelleGamme(commande.gamme) : undefined,
        pointVenteNom: commande.pointVente.nomEtablissement,
        villeNom: commande.pointVente.ville?.nom,
        quartier: commande.pointVente.quartier,
        commercialNom: `${commande.commercial.prenom} ${commande.commercial.nom}`,
        lignes: commande.lignes.map((l) => ({
          produitNom: l.produit?.nom || "Produit",
          quantiteCartons: l.quantite,
          prixCarton: Number(l.prixUnitaire),
          sousTotal: Number(l.sousTotal),
        })),
        montantTotal: Number(commande.montantTotal),
        modePaiement: commande.modePaiement,
        montantRecu: Number(commande.montantRecu),
        resteAPayer: Number(commande.resteAPayer),
      });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <button className="btn-secondary" onClick={telecharger} disabled={enCours}>
      <IconDownload className="h-4 w-4" />
      {enCours ? "Génération…" : "Facture"}
    </button>
  );
}
