"use client";

import { ajouterLogoPdf } from "./logoPdf";
import type { ActiviteJour } from "@/components/ActiviteDuJour";
import { nombreFr } from "./format";
import { formaterCartons } from "./quantites";

const EMERAUDE: [number, number, number] = [15, 61, 46];
const OR: [number, number, number] = [166, 124, 35];
const IVOIRE: [number, number, number] = [245, 241, 228];
const fcfa = (n: number) => `${nombreFr(Math.round(n))} FCFA`;

/** Synthèse PDF de l'activité du jour (mêmes chiffres que le tableau de bord). */
export async function genererTableauDeBordPdf(d: ActiviteJour, prenom: string, dateLongue: string) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = doc.internal.pageSize.getWidth();

  doc.setFillColor(...EMERAUDE);
  doc.rect(0, 0, L, 26, "F");
  doc.setFillColor(...OR);
  doc.rect(0, 26, L, 1.2, "F");
  const w = await ajouterLogoPdf(doc, 12, 5, 16);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(15).text("Tableau de bord — activité du jour", 12 + w + 4, 13);
  doc.setFont("helvetica", "normal").setFontSize(9).text(`${dateLongue} · édité pour ${prenom}`, 12 + w + 4, 19);

  const k = d.kpi;
  let y = 34;
  const titre = (t: string) => {
    doc.setTextColor(...EMERAUDE).setFont("helvetica", "bold").setFontSize(10).text(t.toUpperCase(), 12, y);
    y += 2;
  };
  const suite = () => ((doc as any).lastAutoTable.finalY as number) + 7;
  const style = { headStyles: { fillColor: EMERAUDE, textColor: 255 }, alternateRowStyles: { fillColor: IVOIRE }, styles: { fontSize: 8.5, cellPadding: 1.8 }, margin: { left: 12, right: 12 } } as const;

  titre("Aujourd'hui");
  autoTable(doc, {
    startY: y,
    ...style,
    head: [["Indicateur", "Valeur", "Détail"]],
    body: [
      ["Points visités", String(k.pointsVisites), `hier ${k.pointsVisitesHier} · moyenne ${k.moyennePoints7j} / jour sur 7 jours`],
      ["Visites réalisées", String(k.visites), ""],
      ["Ventes validées", String(k.ventesValidees), `${formaterCartons(k.cartonsValides)} cartons · ${k.livrees} livrée(s), ${k.aLivrer} à livrer`],
      ["Chiffre d'affaires", fcfa(k.chiffreAffaires), "ventes validées du jour, nettes d'avoirs"],
      ["Encaissé en caisse", fcfa(k.encaisse), `dépenses du jour : ${fcfa(k.depenses)}`],
      ["Commandes en attente", String(k.enAttente), `${fcfa(k.enAttenteMontant)} à valider · ${k.livraisonsAVenir} livraison(s) à venir`],
    ],
  });
  y = suite();

  titre("Cartons vendus par gamme");
  autoTable(doc, {
    startY: y,
    ...style,
    head: [["Gamme", "Aujourd'hui", "Cette semaine", "Ce mois", "Total"]],
    body: d.cartes.map((c) => [c.nom, formaterCartons(c.jour), formaterCartons(c.semaine), formaterCartons(c.mois), formaterCartons(c.total)]),
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
  });
  y = suite();

  titre("Commandes de la journée");
  const j = d.jourCommandes;
  autoTable(doc, {
    startY: y,
    ...style,
    head: [["Statut", "Commandes", "Montant"]],
    body: [
      ["Validées aujourd'hui", String(j.validees.commandes), `${formaterCartons(j.validees.cartons)} cartons · ${fcfa(j.validees.montant)}`],
      ["Déjà livrées", String(j.livrees.commandes), fcfa(j.livrees.montant)],
      ["À livrer", String(j.aLivrer.commandes), fcfa(j.aLivrer.montant)],
      ["En attente de validation", String(j.enAttente.commandes), fcfa(j.enAttente.montant)],
      ["Validées avant aujourd'hui, encore à livrer", String(j.anterieuresALivrer.commandes), `${formaterCartons(j.anterieuresALivrer.cartons)} cartons · ${fcfa(j.anterieuresALivrer.montant)}`],
    ],
  });
  y = suite();
  if (y > 190) {
    doc.addPage();
    y = 16;
  }

  titre("Ventes par jour — 14 derniers jours");
  autoTable(doc, {
    startY: y,
    ...style,
    head: [["Jour", ...d.gammes.map((g) => g.nom), "Total cartons", "Cmd", "Facturé (FCFA)"]],
    body: [...d.tableau].reverse().map((t) => [
      new Date(`${t.jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }),
      ...d.gammes.map((g) => formaterCartons(t.parGamme[g.id] || 0)),
      formaterCartons(t.cartons),
      String(t.commandes),
      nombreFr(Math.round(t.facture)),
    ]),
    foot: [["Total 14 jours", ...d.gammes.map((g) => formaterCartons(d.tableau.reduce((s, t) => s + (t.parGamme[g.id] || 0), 0))), formaterCartons(d.tableau.reduce((s, t) => s + t.cartons, 0)), String(d.tableau.reduce((s, t) => s + t.commandes, 0)), nombreFr(Math.round(d.tableau.reduce((s, t) => s + t.facture, 0)))]],
    footStyles: { fillColor: IVOIRE, textColor: EMERAUDE, fontStyle: "bold" },
  });

  doc.save(`tableau-de-bord-${d.date}.pdf`);
}
