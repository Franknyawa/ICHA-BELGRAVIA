"use client";

import { formaterMontant } from "./facturePdf";
import type { Colonne } from "./rapports";

const COULEUR_EMERAUDE: [number, number, number] = [15, 61, 46];
const COULEUR_OR: [number, number, number] = [166, 124, 35];
const COULEUR_IVOIRE: [number, number, number] = [250, 247, 238];
const COULEUR_ENCRE: [number, number, number] = [26, 46, 34];
const COULEUR_TEXTE_ATT: [number, number, number] = [90, 100, 92];

export type ExportRapportData = {
  titre: string;
  sousTitre: string; // résumé des filtres actifs, affiché sous le titre
  colonnes: Colonne[];
  lignes: Record<string, string | number>[];
  totaux: Record<string, number>;
};

/**
 * Export PDF générique pour n'importe quelle vue de rapport (par
 * commercial / point de vente / ville / quartier / détail des ventes) —
 * une seule fonction suffit puisque colonnes/lignes/totaux décrivent
 * entièrement la table à dessiner. Même identité visuelle que les
 * factures/bons de livraison (émeraude/or/ivoire).
 */
export async function exporterRapportPdf(data: ExportRapportData) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: data.colonnes.length > 6 ? "landscape" : "portrait" });
  const largeur = doc.internal.pageSize.getWidth();

  doc.setFillColor(...COULEUR_EMERAUDE);
  doc.rect(0, 0, largeur, 26, "F");
  doc.setTextColor(...COULEUR_IVOIRE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("BELGRAVIA", 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(data.titre, 14, 19);

  doc.setTextColor(...COULEUR_TEXTE_ATT);
  doc.setFontSize(9);
  doc.text(data.sousTitre || "Toutes périodes, tous filtres", 14, 33);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, largeur - 14, 33, { align: "right" });

  const formatCell = (colonne: Colonne, valeur: string | number) => {
    if (colonne.montant) return `${formaterMontant(Number(valeur))} FCFA`;
    return String(valeur ?? "—") || "—";
  };

  autoTable(doc, {
    startY: 39,
    head: [data.colonnes.map((c) => c.label)],
    body: data.lignes.map((ligne) => data.colonnes.map((c) => formatCell(c, ligne[c.cle]))),
    foot: [
      data.colonnes.map((c, i) => {
        if (i === 0) return "Total";
        if (c.cle in data.totaux) return formatCell(c, data.totaux[c.cle]);
        return "";
      }),
    ],
    styles: { fontSize: 8.5, textColor: COULEUR_ENCRE },
    headStyles: { fillColor: COULEUR_EMERAUDE, textColor: COULEUR_IVOIRE, fontStyle: "bold" },
    footStyles: { fillColor: [240, 234, 218], textColor: COULEUR_ENCRE, fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      data.colonnes.map((c, i) => [i, c.droite ? { halign: "right" as const } : {}])
    ),
    alternateRowStyles: { fillColor: [252, 250, 245] },
  });

  doc.save(`rapport-${data.titre.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
