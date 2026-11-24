"use client";

import { genererFacturePdf, formaterMontant } from "./facturePdf";
import { libelleGamme } from "./gammesClient";
import { nomFichierNumero } from "./numerotation";

/** PDF des documents de la page Facturation : facture de vente (FV), facture retour (FR), facture d'avoir (FA). */

type PointVente = { nomEtablissement: string; quartier: string | null; ville: { nom: string } | null };
type Commercial = { nom: string; prenom: string };
type Gamme = { code: string; nom: string } | null | undefined;

export type FactureVente = {
  id: string;
  numeroFV: string | null;
  dateCommande: string;
  livreeLe: string | null;
  montantTotal: number;
  avoirsTotal: number;
  net: number;
  encaisse: number;
  reste: number;
  modePaiement: string;
  pointVente: PointVente;
  commercial: Commercial;
  gamme?: Gamme;
  lignes: { libelle: string; quantite: number; prixUnitaire: number; sousTotal: number }[];
};

export type DocumentCorrectifListe = {
  type: "FR" | "FA";
  numero: string;
  createdAt: string;
  motif: string;
  destination: string | null;
  canalRemboursement: string | null;
  montant: number;
  remboursement: number;
  lignes: { libelle: string; quantite: number; prixUnitaire: number; sousTotal: number }[];
  commande: { numeroFV: string | null; pointVente: PointVente; commercial: Commercial; gamme?: Gamme };
};

const CANAUX: Record<string, string> = { ESPECES: "Espèces", OM_MOMO: "OM/MOMO", BANQUE: "Banque" };
const fcfa = (n: number) => `${formaterMontant(n)} FCFA`;

export async function telechargerFactureVente(c: FactureVente) {
  const numero = c.numeroFV ?? c.id.slice(0, 8).toUpperCase();
  await genererFacturePdf({
    numero,
    nomFichier: nomFichierNumero(numero),
    date: new Date(c.livreeLe ?? c.dateCommande),
    gammeNom: c.gamme ? libelleGamme(c.gamme) : undefined,
    pointVenteNom: c.pointVente.nomEtablissement,
    villeNom: c.pointVente.ville?.nom,
    quartier: c.pointVente.quartier,
    commercialNom: `${c.commercial.prenom} ${c.commercial.nom}`,
    lignes: c.lignes.map((l) => ({ code: c.gamme?.code, produitNom: l.libelle, quantiteCartons: l.quantite, prixCarton: l.prixUnitaire, sousTotal: l.sousTotal })),
    montantTotal: c.montantTotal,
    modePaiement: c.modePaiement,
    montantRecu: c.encaisse,
    resteAPayer: c.reste,
    ...(c.avoirsTotal > 0
      ? {
          totaux: [
            { label: "Montant facturé", valeur: fcfa(c.montantTotal) },
            { label: "Retours / avoirs", valeur: `- ${fcfa(c.avoirsTotal)}` },
            { label: "Net à payer", valeur: fcfa(c.net) },
            { label: "Encaissé", valeur: fcfa(c.encaisse) },
            ...(c.reste > 0 ? [{ label: "Reste à payer", valeur: fcfa(c.reste), alerte: true }] : []),
          ],
        }
      : {}),
  });
}

export async function telechargerDocumentCorrectif(d: DocumentCorrectifListe) {
  const lignes = d.lignes.length
    ? d.lignes.map((l) => ({ code: d.commande.gamme?.code, produitNom: l.libelle, quantiteCartons: l.quantite, prixCarton: l.prixUnitaire, sousTotal: l.sousTotal }))
    : [{ produitNom: "Correction commerciale (montant libre)", quantiteCartons: 1, prixCarton: d.montant, sousTotal: d.montant }];
  const estFR = d.type === "FR";
  await genererFacturePdf({
    titre: estFR ? "FACTURE RETOUR" : "FACTURE D'AVOIR",
    numero: d.numero,
    nomFichier: nomFichierNumero(d.numero),
    reference: d.commande.numeroFV ?? undefined,
    date: new Date(d.createdAt),
    gammeNom: d.commande.gamme ? libelleGamme(d.commande.gamme) : undefined,
    pointVenteNom: d.commande.pointVente.nomEtablissement,
    villeNom: d.commande.pointVente.ville?.nom,
    quartier: d.commande.pointVente.quartier,
    commercialNom: `${d.commande.commercial.prenom} ${d.commande.commercial.nom}`,
    lignes,
    montantTotal: d.montant,
    modePaiement: "",
    montantRecu: 0,
    resteAPayer: 0,
    motif: d.motif,
    signatures: false,
    totaux: [
      { label: estFR ? "Valeur des retours" : "Montant de l'avoir", valeur: fcfa(d.montant) },
      ...(estFR && d.destination ? [{ label: "Destination", valeur: d.destination === "AVARIES" ? "Avaries" : "Stock vendable" }] : []),
      ...(d.remboursement > 0
        ? [{ label: `Remboursé (${CANAUX[d.canalRemboursement ?? ""] ?? "caisse"})`, valeur: fcfa(d.remboursement) }]
        : []),
    ],
  });
}
