/** Export CSV côté navigateur : séparateur « ; » et BOM pour qu'Excel (FR) lise les accents. */
function echapper(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  let s = String(valeur);
  // Neutralise l'injection de formule (=, +, -, @) à l'ouverture dans Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function telechargerCsv(nomFichier: string, entetes: string[], lignes: (string | number | null | undefined)[][]) {
  const corps = [entetes, ...lignes].map((l) => l.map(echapper).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + corps], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomFichier}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
