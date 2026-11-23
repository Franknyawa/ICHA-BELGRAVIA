"use client";

import { formaterMontant } from "./facturePdf";
import { NOM_APP, SIGNATURE_APP } from "./marque";
import { ajouterLogoPdf } from "./logoPdf";

const EMERAUDE: [number, number, number] = [15, 61, 46];
const IVOIRE: [number, number, number] = [250, 247, 238];
const GRIS: [number, number, number] = [90, 100, 92];

export type ClientPdfData = {
  mode: "FICHE" | "RELEVE";
  nom: string;
  sousTitre: string;
  contact: string;
  kpis: { label: string; valeur: string }[];
  factures: (string | number)[][];
  releve: (string | number)[][];
};

const fm = (n: number) => `${formaterMontant(n)} FCFA`;
export { fm as montantPdf };

export async function exporterClientPdf(d: ClientPdfData) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const l = doc.internal.pageSize.getWidth();

  doc.setFillColor(...EMERAUDE);
  doc.rect(0, 0, l, 26, "F");
  doc.setTextColor(...IVOIRE);
  const lg = await ajouterLogoPdf(doc, 14, 3, 20);
  const x = lg ? 14 + lg + 6 : 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(NOM_APP, x, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${d.mode === "FICHE" ? "Fiche client" : "Relevé de compte"} — ${SIGNATURE_APP}`, x, 19);

  doc.setTextColor(26, 46, 34);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(d.nom, 14, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(d.sousTitre, 14, 42);
  if (d.contact) doc.text(d.contact, 14, 47);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, l - 14, 36, { align: "right" });

  autoTable(doc, {
    startY: 52,
    head: [d.kpis.map((k) => k.label)],
    body: [d.kpis.map((k) => k.valeur)],
    theme: "grid",
    headStyles: { fillColor: EMERAUDE, textColor: IVOIRE, fontSize: 8 },
    styles: { fontSize: 10, fontStyle: "bold", halign: "center" },
  });

  const y = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const tableau = (titre: string, head: string[], body: (string | number)[][], droite: number[]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(26, 46, 34);
    const yy = y();
    doc.text(titre, 14, yy);
    autoTable(doc, {
      startY: yy + 3,
      head: [head],
      body: body.length ? body : [[{ content: "Aucune ligne", colSpan: head.length, styles: { halign: "center" } } as unknown as string]],
      headStyles: { fillColor: EMERAUDE, textColor: IVOIRE, fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: Object.fromEntries(droite.map((i) => [i, { halign: "right" as const }])),
    });
  };

  if (d.mode === "FICHE") tableau("Factures et situation", ["Facture", "Date", "Montant", "Encaissé", "Reste"], d.factures, [2, 3, 4]);
  tableau("Relevé de compte (débit / crédit)", ["Date", "Pièce", "Libellé", "Débit", "Crédit", "Solde"], d.releve, [3, 4, 5]);

  doc.save(`${d.mode === "FICHE" ? "fiche" : "releve"}-${d.nom.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
