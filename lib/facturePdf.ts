"use client";

import { libelleModePaiement } from "./pricing";

/**
 * Génère la facture PDF BELGRAVIA — même logique et structure que le
 * modèle de référence (en-tête, blocs point de vente/vendu par, tableau
 * produits, bloc totaux, signatures) mais adaptée à l'identité visuelle
 * BELGRAVIA (ivoire/or/émeraude) et à la vente au carton uniquement (une
 * seule colonne quantité, plus le prix/carton et le sous-total par ligne,
 * utiles ici puisque le prix dépend du palier de la commande entière).
 */

export type FactureLigne = {
  produitNom: string;
  quantiteCartons: number;
  prixCarton: number;
  sousTotal: number;
};

export type FactureData = {
  numero: string;
  date: Date;
  pointVenteNom: string;
  villeNom?: string | null;
  quartier?: string | null;
  commercialNom: string;
  lignes: FactureLigne[];
  montantTotal: number;
  modePaiement: string; // valeur de l'enum ModePaiement
  montantRecu: number;
  resteAPayer: number;
};

const COULEUR_EMERAUDE: [number, number, number] = [15, 61, 46]; // #0f3d2e
const COULEUR_OR: [number, number, number] = [166, 124, 35]; // brass
const COULEUR_IVOIRE: [number, number, number] = [250, 247, 238];
const COULEUR_ALERTE: [number, number, number] = [178, 58, 46]; // #b23a2e
const COULEUR_TEXTE_ATT: [number, number, number] = [90, 100, 92];
const COULEUR_ENCRE: [number, number, number] = [26, 46, 34];

export async function genererFacturePdf(data: FactureData) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF();
  const largeur = doc.internal.pageSize.getWidth();

  // --- En-tête -----------------------------------------------------------
  doc.setFillColor(...COULEUR_EMERAUDE);
  doc.rect(0, 0, largeur, 38, "F");
  doc.setFillColor(...COULEUR_OR);
  doc.rect(0, 34, largeur, 4, "F");

  doc.setTextColor(...COULEUR_IVOIRE);
  doc.setFont("times", "italic");
  doc.setFontSize(20);
  doc.text("Belgravia", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Cocktails prêts à boire — recensement & prise de commande", 14, 25);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("FACTURE", largeur - 14, 16, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`N° ${data.numero}`, largeur - 14, 22, { align: "right" });
  doc.text(data.date.toLocaleDateString("fr-FR"), largeur - 14, 27, { align: "right" });

  // --- Bloc infos ----------------------------------------------------------
  const yInfos = 48;
  const largeurColonne = (largeur - 28 - 6) / 2;

  doc.setFillColor(245, 241, 228);
  doc.roundedRect(14, yInfos, largeurColonne, 24, 2, 2, "F");
  doc.roundedRect(14 + largeurColonne + 6, yInfos, largeurColonne, 24, 2, 2, "F");

  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("POINT DE VENTE", 18, yInfos + 7);
  doc.text("VENDU PAR", 14 + largeurColonne + 10, yInfos + 7);

  doc.setTextColor(...COULEUR_ENCRE);
  doc.setFontSize(11);
  doc.text(data.pointVenteNom, 18, yInfos + 14);
  doc.text(data.commercialNom, 14 + largeurColonne + 10, yInfos + 14);

  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const localisation = [data.quartier, data.villeNom].filter(Boolean).join(", ");
  if (localisation) doc.text(localisation, 18, yInfos + 20);
  doc.text(
    `Le ${data.date.toLocaleDateString("fr-FR")} à ${data.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    14 + largeurColonne + 10,
    yInfos + 20
  );

  // --- Tableau produits ----------------------------------------------------
  autoTable(doc, {
    startY: yInfos + 32,
    head: [["Produit", "Cartons", "Prix/carton", "Sous-total"]],
    body: data.lignes.map((l) => [
      l.produitNom,
      String(l.quantiteCartons),
      `${l.prixCarton.toLocaleString("fr-FR")} FCFA`,
      `${l.sousTotal.toLocaleString("fr-FR")} FCFA`,
    ]),
    theme: "striped",
    headStyles: { fillColor: COULEUR_EMERAUDE, textColor: 255, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: [250, 247, 238] },
    styles: { fontSize: 9.5, textColor: COULEUR_ENCRE, cellPadding: 3 },
    columnStyles: {
      1: { halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  // --- Bloc totaux ---------------------------------------------------------
  const finTableau = (doc as any).lastAutoTable.finalY + 8;
  const largeurBoiteTotal = 76;
  const xBoiteTotal = largeur - 14 - largeurBoiteTotal;

  let y = finTableau;
  doc.setFontSize(9.5);
  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.setFont("helvetica", "normal");
  doc.text("Montant total", xBoiteTotal, y);
  doc.setTextColor(...COULEUR_ENCRE);
  doc.setFont("helvetica", "bold");
  doc.text(`${data.montantTotal.toLocaleString("fr-FR")} FCFA`, largeur - 14, y, { align: "right" });

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.text("Mode de paiement", xBoiteTotal, y);
  doc.setTextColor(...COULEUR_ENCRE);
  doc.text(libelleModePaiement(data.modePaiement), largeur - 14, y, { align: "right" });

  y += 6;
  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.text("Montant reçu", xBoiteTotal, y);
  doc.setTextColor(...COULEUR_EMERAUDE);
  doc.setFont("helvetica", "bold");
  doc.text(`${data.montantRecu.toLocaleString("fr-FR")} FCFA`, largeur - 14, y, { align: "right" });

  if (data.resteAPayer > 0) {
    y += 8;
    doc.setFillColor(250, 235, 232);
    doc.roundedRect(xBoiteTotal - 4, y - 5, largeurBoiteTotal + 4, 9, 1.5, 1.5, "F");
    doc.setTextColor(...COULEUR_ALERTE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Reste à payer", xBoiteTotal, y);
    doc.text(`${data.resteAPayer.toLocaleString("fr-FR")} FCFA`, largeur - 14, y, { align: "right" });
  }

  // --- Signatures ------------------------------------------------------
  const ySignatures = Math.max(y + 30, doc.internal.pageSize.getHeight() - 45);
  doc.setDrawColor(210, 200, 175);
  doc.setLineWidth(0.3);
  doc.line(14, ySignatures, 90, ySignatures);
  doc.line(largeur - 90, ySignatures, largeur - 14, ySignatures);
  doc.setFontSize(8.5);
  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.setFont("helvetica", "normal");
  doc.text("Signature du client", 14, ySignatures + 5);
  doc.text(`Signature — ${data.commercialNom}`, largeur - 90, ySignatures + 5);

  // --- Pied de page --------------------------------------------------------
  const hauteurPage = doc.internal.pageSize.getHeight();
  doc.setDrawColor(226, 220, 200);
  doc.line(14, hauteurPage - 14, largeur - 14, hauteurPage - 14);
  doc.setFontSize(8);
  doc.setTextColor(150, 145, 130);
  doc.setFont("helvetica", "italic");
  doc.text("Merci pour votre confiance — Belgravia", largeur / 2, hauteurPage - 8, { align: "center" });

  doc.save(`facture-${data.pointVenteNom.replace(/\s+/g, "-").toLowerCase()}-${data.numero}.pdf`);
}
