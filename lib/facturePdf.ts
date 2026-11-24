"use client";

import { formaterCartons } from "./quantites";
import { libelleModePaiement } from "./pricing";
import { ajouterLogoPdf, ajouterFiligrane } from "./logoPdf";
import { montantEnLettres } from "./enLettres";

/**
 * Formate un montant avec un point comme séparateur de milliers
 * (ex. 21500 → "21.500"), tel que demandé. `toLocaleString("fr-FR")` insère
 * une espace fine insécable (U+202F) entre les groupes de chiffres, un
 * caractère que la police par défaut de jsPDF (helvetica/WinAnsi) ne sait
 * pas dessiner — les montants apparaissaient donc déformés dans le PDF.
 */
export function formaterMontant(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Génère la facture PDF BELGRAVIA — même logique et structure que le
 * modèle de référence (en-tête, blocs point de vente/vendu par, tableau
 * produits, bloc totaux, signatures) mais adaptée à l'identité visuelle
 * BELGRAVIA (ivoire/or/émeraude) et à la vente au carton uniquement (une
 * seule colonne quantité, plus le prix/carton et le sous-total par ligne,
 * utiles ici puisque le prix dépend du palier de la commande entière).
 */

export type FactureLigne = {
  /** Code / référence (ex. code de la gamme). */
  code?: string;
  produitNom: string;
  quantiteCartons: number;
  prixCarton: number;
  sousTotal: number;
};

export type FactureData = {
  /** "FACTURE" par défaut ; "BON DE COMMANDE" réutilise la même mise en page. */
  titre?: string;
  numero: string;
  date: Date;
  gammeNom?: string; // ex. "Belgravia" ou "VDV" — affichée dans l'en-tête
  pointVenteNom: string;
  villeNom?: string | null;
  quartier?: string | null;
  commercialNom: string;
  /** Libellé devant le nom du commercial (« Agent de facturation » par défaut). */
  libelleAgent?: string;
  lignes: FactureLigne[];
  montantTotal: number;
  modePaiement: string; // valeur de l'enum ModePaiement
  montantRecu: number;
  resteAPayer: number;
  /** Facture retour / avoir : facture de vente d'origine. */
  reference?: string;
  /** Motif (FR/FA), imprimé sous le tableau. */
  motif?: string;
  /** Remplace le bloc « montant / mode / reçu » (FR/FA, BC). */
  totaux?: { label: string; valeur: string; alerte?: boolean }[];
  /** Préfixe du nom de fichier (ex. numéro de document). */
  nomFichier?: string;
  /** Signatures : masquées pour les documents correctifs si false. */
  signatures?: boolean;
};

// Charte de l'application : émeraude, or (brass) et ivoire.
const BLEU: [number, number, number] = [15, 61, 46]; // émeraude
const VERT: [number, number, number] = [166, 124, 35]; // or
const IVOIRE: [number, number, number] = [250, 247, 238];
const IVOIRE_FONCE: [number, number, number] = [245, 241, 228];
const FILET: [number, number, number] = [226, 220, 200];
const ENCRE: [number, number, number] = [22, 30, 46];
const GRIS: [number, number, number] = [100, 110, 125];
const ALERTE: [number, number, number] = [178, 58, 46];

/** Montant lisible par jsPDF : espace simple comme séparateur de milliers (« 27 000 »). */
const fm = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const MENTION: Record<string, string> = {
  FACTURE: "la présente facture",
  "BON DE COMMANDE": "le présent bon de commande",
  "FACTURE RETOUR": "la présente facture retour",
  "FACTURE D'AVOIR": "la présente facture d'avoir",
};

/**
 * Facture PDF (FV), bon de commande (BC), facture retour (FR) et facture d'avoir (FA) : même mise en page —
 * bandeau bleu avec logo et date, blocs « document » / « point de vente », tableau Code · Désignation ·
 * Quantité · Prix unitaire · Remise · Prix total, totaux, montant en lettres, logo SIRI en filigrane.
 */
export async function genererFacturePdf(data: FactureData) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF();
  const L = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const titre = data.titre || "FACTURE";

  // --- Bandeau -----------------------------------------------------------
  doc.setFillColor(...BLEU);
  doc.rect(0, 0, L, 40, "F");
  doc.setFillColor(...VERT);
  doc.rect(0, 40, L, 4, "F");

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, 6, 34, 28, 4, 4, "F");
  await ajouterLogoPdf(doc, 19, 13, 14);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("SIRI IMPORT", 56, 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Importation, Commerce Général, Prestation de Services", 56, 26);
  if (data.gammeNom) doc.text(`Gamme ${data.gammeNom}`, 56, 31);

  doc.setFontSize(8);
  doc.setTextColor(226, 214, 180);
  doc.text("Date et Heure", L - 14, 14, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(data.date.toLocaleDateString("fr-FR"), L - 14, 21, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(226, 214, 180);
  doc.text(`à ${data.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`, L - 14, 27, { align: "right" });

  // --- Blocs ---------------------------------------------------------------
  const y0 = 54;
  const w = (L - 28 - 6) / 2;
  const h = 34;
  doc.setLineWidth(0.4);
  doc.setFillColor(...IVOIRE);
  doc.setDrawColor(...VERT);
  doc.roundedRect(14, y0, w, h, 3, 3, "FD");
  doc.setFillColor(...IVOIRE_FONCE);
  doc.setDrawColor(...FILET);
  doc.roundedRect(14 + w + 6, y0, w, h, 3, 3, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BLEU);
  doc.text(titre, 19, y0 + 8);
  doc.setTextColor(...GRIS);
  doc.text("POINT DE VENTE", 14 + w + 11, y0 + 8);

  doc.setTextColor(...ENCRE);
  doc.setFontSize(13);
  doc.text(data.numero, 19, y0 + 16);
  doc.text(doc.splitTextToSize(data.pointVenteNom, w - 10)[0], 14 + w + 11, y0 + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(`${data.libelleAgent || "Agent de facturation"} : ${data.commercialNom}`, 19, y0 + 23);
  if (data.reference) doc.text(`Facture d'origine : ${data.reference}`, 19, y0 + 29);
  const lieu = [data.villeNom ? `Ville : ${data.villeNom}` : "", data.quartier ? `Quartier : ${data.quartier}` : ""].filter(Boolean);
  lieu.forEach((t, i) => doc.text(t, 14 + w + 11, y0 + 23 + i * 6));

  // --- Tableau ---------------------------------------------------------------
  autoTable(doc, {
    startY: y0 + h + 10,
    head: [["Code /\nRéférence", "Désignation", "Quantité\n(cartons)", "Prix unitaire", "Remise", "Prix total"]],
    body: data.lignes.map((l) => [l.code || "—", l.produitNom, formaterCartons(l.quantiteCartons), fm(l.prixCarton), "—", fm(l.sousTotal)]),
    theme: "grid",
    headStyles: { fillColor: BLEU, textColor: 255, fontStyle: "bold", fontSize: 8.5, valign: "middle", lineColor: [255, 255, 255] },
    bodyStyles: { fontSize: 9, textColor: ENCRE, cellPadding: 3, lineColor: FILET, valign: "middle" },
    alternateRowStyles: { fillColor: IVOIRE },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 26 },
      2: { halign: "center", cellWidth: 26 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "center", cellWidth: 20 },
      5: { halign: "right", fontStyle: "bold", cellWidth: 30 },
    },
    margin: { left: 14, right: 14 },
  });

  // --- Totaux ----------------------------------------------------------------
  let y = (doc as any).lastAutoTable.finalY + 10;
  if (y > H - 70) {
    doc.addPage();
    y = 24;
  }
  const xl = L - 14 - 84;
  const ligne = (label: string, valeur: string, opts: { fort?: boolean; couleur?: [number, number, number] } = {}) => {
    doc.setFont("helvetica", opts.fort ? "bold" : "normal");
    doc.setFontSize(opts.fort ? 11 : 9.5);
    doc.setTextColor(...(opts.fort ? ENCRE : GRIS));
    doc.text(label, xl, y);
    doc.setFont("helvetica", opts.fort ? "bold" : "normal");
    doc.setTextColor(...(opts.couleur || ENCRE));
    doc.text(valeur, L - 14, y, { align: "right" });
    y += opts.fort ? 8 : 6.5;
  };
  doc.setDrawColor(...FILET);
  doc.setLineWidth(0.3);
  doc.line(xl, y - 6, L - 14, y - 6);

  if (data.totaux) {
    data.totaux.forEach((t, i) => ligne(t.label, t.valeur, { fort: i === 0, couleur: t.alerte ? ALERTE : undefined }));
  } else {
    ligne("Montant total", `${fm(data.montantTotal)} FCFA`, { fort: true });
    ligne("Moyen de paiement", libelleModePaiement(data.modePaiement));
    ligne("Déjà réglé", `${fm(data.montantRecu)} FCFA`, { couleur: VERT });
    if (data.resteAPayer > 0) ligne("Reste à payer", `${fm(data.resteAPayer)} FCFA`, { couleur: ALERTE });
  }

  // --- Montant en lettres, motif ---------------------------------------------
  y += 4;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(...ENCRE);
  const phrase = `Arrêter ${MENTION[titre] || "le présent document"} à la somme en Francs de : ${montantEnLettres(data.montantTotal)}.`;
  const lp = doc.splitTextToSize(phrase, L - 28) as string[];
  doc.text(lp, 14, y);
  y += lp.length * 5 + 4;

  if (data.motif) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRIS);
    doc.text("MOTIF", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...ENCRE);
    const lm = doc.splitTextToSize(data.motif, L - 28) as string[];
    doc.text(lm, 14, y + 5);
  }

  // --- Signatures (pied de la dernière page) ----------------------------------
  doc.setPage(doc.getNumberOfPages());
  const ys = H - 38;
  doc.setDrawColor(...FILET);
  doc.setLineWidth(0.4);
  doc.line(14, ys, 98, ys);
  doc.line(L - 98, ys, L - 14, ys);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text("Signature Siri Import", 56, ys + 6, { align: "center" });
  doc.text(`Signature ${data.pointVenteNom}`, L - 56, ys + 6, { align: "center", maxWidth: 80 });

  // --- Filigrane sur chaque page -----------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    await ajouterFiligrane(doc);
  }

  doc.save(`${data.nomFichier || `facture-${data.pointVenteNom.replace(/\s+/g, "-").toLowerCase()}-${data.numero.replace(/\s+/g, "-")}`}.pdf`);
}
