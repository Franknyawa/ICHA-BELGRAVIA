/** Montant en lettres, en français (ex. 27000 → « Vingt-sept mille francs CFA »). Entiers positifs jusqu'aux milliards. */
const UNITES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0–99. `final` : le « s » de quatre-vingts ne subsiste que s'il termine le nombre. */
function sousCent(n: number, final: boolean): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    const base = d === 7 ? "soixante" : "quatre-vingt";
    const reste = 10 + u;
    if (d === 7) return `${base}${u === 1 ? " et " : "-"}${UNITES[reste]}`;
    return `${base}-${UNITES[reste]}`;
  }
  if (d === 8) return u === 0 ? (final ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${UNITES[u]}`;
  if (u === 0) return DIZAINES[d];
  return `${DIZAINES[d]}${u === 1 ? " et " : "-"}${UNITES[u]}`;
}

/** 0–999. */
function sousMille(n: number, final: boolean): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let t = "";
  if (c > 0) {
    t = c === 1 ? "cent" : `${UNITES[c]} cent`;
    if (c > 1 && r === 0 && final) t += "s";
  }
  if (r > 0) t += (t ? " " : "") + sousCent(r, final);
  return t;
}

export function nombreEnLettres(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zéro";
  const groupes: [number, string, string][] = [
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
  ];
  let reste = n;
  const parts: string[] = [];
  for (const [v, s, p] of groupes) {
    const q = Math.floor(reste / v);
    if (q > 0) {
      parts.push(`${sousMille(q, false)} ${q > 1 ? p : s}`);
      reste %= v;
    }
  }
  const mille = Math.floor(reste / 1000);
  if (mille > 0) {
    parts.push(mille === 1 ? "mille" : `${sousMille(mille, false)} mille`);
    reste %= 1000;
  }
  if (reste > 0) parts.push(sousMille(reste, true));
  return parts.join(" ");
}

export function montantEnLettres(n: number): string {
  n = Math.floor(Math.abs(n));
  const t = nombreEnLettres(n);
  const mot = n <= 1 ? "franc" : n % 1_000_000 === 0 ? "de francs" : "francs";
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} ${mot} CFA`;
}
