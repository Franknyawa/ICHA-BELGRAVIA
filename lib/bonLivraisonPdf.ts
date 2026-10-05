"use client";

import { formaterMontant } from "./facturePdf";
import { libelleModePaiement } from "./pricing";
import { NOM_APP, NOM_APP_COMPLET, SIGNATURE_APP } from "./marque";

/**
 * Génère le bon de livraison — même identité visuelle que la facture, mais
 * centré sur les informations de livraison (produits/quantités à livrer,
 * point de vente, livreur/commercial) plutôt que sur les montants détaillés
 * par ligne. Déclenché côté admin dès que le statut d'une commande passe à
 * LIVREE (voir app/(admin)/commandes/page.tsx).
 */

export type BonLivraisonLigne = { produitNom: string; quantiteCartons: number };

export type BonLivraisonData = {
  numero: string;
  gammeNom?: string;
  dateLivraison: Date;
  pointVenteNom: string;
  nomVendeur?: string | null;
  telVendeur?: string | null;
  villeNom?: string | null;
  quartier?: string | null;
  commercialNom: string;
  lignes: BonLivraisonLigne[];
  montantTotal: number;
  modePaiement: string;
  resteAPayer: number;
};

const COULEUR_EMERAUDE: [number, number, number] = [15, 61, 46];
const COULEUR_OR: [number, number, number] = [166, 124, 35];
const COULEUR_IVOIRE: [number, number, number] = [250, 247, 238];
const COULEUR_ALERTE: [number, number, number] = [178, 58, 46];
const COULEUR_TEXTE_ATT: [number, number, number] = [90, 100, 92];
const COULEUR_ENCRE: [number, number, number] = [26, 46, 34];

export async function genererBonLivraisonPdf(data: BonLivraisonData) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF();
  const largeur = doc.internal.pageSize.getWidth();

  // --- En-tête -------------------------------------------------------------
  doc.setFillColor(...COULEUR_EMERAUDE);
  doc.rect(0, 0, largeur, 38, "F");
  doc.setFillColor(...COULEUR_OR);
  doc.rect(0, 34, largeur, 4, "F");

  doc.setTextColor(...COULEUR_IVOIRE);
  doc.setFont("times", "italic");
  doc.setFontSize(20);
  doc.text(NOM_APP, 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(data.gammeNom ? `${SIGNATURE_APP} — Gamme ${data.gammeNom}` : SIGNATURE_APP, 14, 25);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("BON DE LIVRAISON", largeur - 14, 16, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`N° ${data.numero}`, largeur - 14, 22, { align: "right" });
  doc.text(data.dateLivraison.toLocaleDateString("fr-FR"), largeur - 14, 27, { align: "right" });

  // --- Bloc infos ------------------------------------------------------------
  const yInfos = 48;
  const largeurColonne = (largeur - 28 - 6) / 2;

  doc.setFillColor(245, 241, 228);
  doc.roundedRect(14, yInfos, largeurColonne, 28, 2, 2, "F");
  doc.roundedRect(14 + largeurColonne + 6, yInfos, largeurColonne, 28, 2, 2, "F");

  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("LIVRER À", 18, yInfos + 7);
  doc.text("LIVRÉ PAR", 14 + largeurColonne + 10, yInfos + 7);

  doc.setTextColor(...COULEUR_ENCRE);
  doc.setFontSize(11);
  doc.text(data.pointVenteNom, 18, yInfos + 14);
  doc.text(data.commercialNom, 14 + largeurColonne + 10, yInfos + 14);

  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const localisation = [data.quartier, data.villeNom].filter(Boolean).join(", ");
  if (localisation) doc.text(localisation, 18, yInfos + 20);
  if (data.nomVendeur) doc.text(`Contact : ${data.nomVendeur}${data.telVendeur ? ` — ${data.telVendeur}` : ""}`, 18, yInfos + 25);
  doc.text(`Livraison du ${data.dateLivraison.toLocaleDateString("fr-FR")}`, 14 + largeurColonne + 10, yInfos + 20);

  // --- Tableau produits à livrer --------------------------------------------
  autoTable(doc, {
    startY: yInfos + 36,
    head: [["Produit", "Cartons à livrer"]],
    body: data.lignes.map((l) => [l.produitNom, String(l.quantiteCartons)]),
    theme: "striped",
    headStyles: { fillColor: COULEUR_EMERAUDE, textColor: 255, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: [250, 247, 238] },
    styles: { fontSize: 9.5, textColor: COULEUR_ENCRE, cellPadding: 3 },
    columnStyles: { 1: { halign: "center" } },
    margin: { left: 14, right: 14 },
  });

  // --- Bloc récap paiement ----------------------------------------------------
  const finTableau = (doc as any).lastAutoTable.finalY + 8;
  const largeurBoiteTotal = 76;
  const xBoiteTotal = largeur - 14 - largeurBoiteTotal;

  let y = finTableau;
  doc.setFontSize(9.5);
  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.setFont("helvetica", "normal");
  doc.text("Montant total de la commande", xBoiteTotal, y);
  doc.setTextColor(...COULEUR_ENCRE);
  doc.setFont("helvetica", "bold");
  doc.text(`${formaterMontant(data.montantTotal)} FCFA`, largeur - 14, y, { align: "right" });

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.text("Mode de paiement", xBoiteTotal, y);
  doc.setTextColor(...COULEUR_ENCRE);
  doc.text(libelleModePaiement(data.modePaiement), largeur - 14, y, { align: "right" });

  if (data.resteAPayer > 0) {
    y += 8;
    doc.setFillColor(250, 235, 232);
    doc.roundedRect(xBoiteTotal - 4, y - 5, largeurBoiteTotal + 4, 9, 1.5, 1.5, "F");
    doc.setTextColor(...COULEUR_ALERTE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Reste à payer à la livraison", xBoiteTotal, y);
    doc.text(`${formaterMontant(data.resteAPayer)} FCFA`, largeur - 14, y, { align: "right" });
  }

  // --- Signatures --------------------------------------------------------
  const ySignatures = Math.max(y + 30, doc.internal.pageSize.getHeight() - 45);
  doc.setDrawColor(210, 200, 175);
  doc.setLineWidth(0.3);
  doc.line(14, ySignatures, 90, ySignatures);
  doc.line(largeur - 90, ySignatures, largeur - 14, ySignatures);
  doc.setFontSize(8.5);
  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.setFont("helvetica", "normal");
  doc.text("Signature du client (réception)", 14, ySignatures + 5);
  doc.text(`Signature — ${data.commercialNom}`, largeur - 90, ySignatures + 5);

  // --- Pied de page --------------------------------------------------------
  const hauteurPage = doc.internal.pageSize.getHeight();
  doc.setDrawColor(226, 220, 200);
  doc.line(14, hauteurPage - 14, largeur - 14, hauteurPage - 14);
  doc.setFontSize(8);
  doc.setTextColor(150, 145, 130);
  doc.setFont("helvetica", "italic");
  doc.text(`Merci pour votre confiance — ${NOM_APP_COMPLET}`, largeur / 2, hauteurPage - 8, { align: "center" });

  doc.save(`bon-livraison-${data.pointVenteNom.replace(/\s+/g, "-").toLowerCase()}-${data.numero}.pdf`);
}
