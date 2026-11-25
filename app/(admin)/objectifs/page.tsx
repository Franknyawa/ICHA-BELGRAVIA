"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconTarget, IconPencil, IconClose, IconTrend, IconCopy, IconStorefront, IconRoute, IconReceipt, IconBox, IconWallet, IconArrowRight } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { useEcriture } from "@/lib/useEcriture";
import { nombreFr } from "@/lib/format";

type Valeurs = { chiffreAffaires: number; nouveauxPv: number; visites: number; commandes: number; cartons: number };
type Ligne = { commercial: { id: string; nom: string; prenom: string }; objectif: Valeurs; realise: Valeurs };
type Cle = keyof Valeurs;
type Icone = (p: { className?: string }) => JSX.Element;

const INDICATEURS: { cle: Cle; label: string; court: string; unite: string; icone: Icone }[] = [
  { cle: "chiffreAffaires", label: "Chiffre d'affaires", court: "CA", unite: "FCFA", icone: IconWallet },
  { cle: "cartons", label: "Cartons vendus", court: "Cartons", unite: "cartons", icone: IconBox },
  { cle: "commandes", label: "Commandes", court: "Commandes", unite: "", icone: IconReceipt },
  { cle: "visites", label: "Visites", court: "Visites", unite: "", icone: IconRoute },
  { cle: "nouveauxPv", label: "Nouveaux points de vente", court: "Nouveaux PV", unite: "", icone: IconStorefront },
];
const SECONDAIRES = INDICATEURS.filter((i) => i.cle !== "chiffreAffaires");

const moisCourant = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 7);
const libelleMois = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const decaler = (m: string, n: number) => {
  const [a, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(a, mm - 1 + n, 15));
  return d.toISOString().slice(0, 7);
};
const initiales = (c: { prenom: string; nom: string }) => `${c.prenom?.[0] || ""}${c.nom?.[0] || ""}`.toUpperCase() || "?";
const aDesObjectifs = (l: Ligne) => INDICATEURS.some((i) => l.objectif[i.cle] > 0);
const nb = (n: number) => nombreFr(Math.round(n * 100) / 100);

/** Score global = moyenne des taux de réalisation (plafonnés à 100 %) des indicateurs fixés. */
function score(l: Ligne) {
  const taux = INDICATEURS.filter((i) => l.objectif[i.cle] > 0).map((i) => Math.min(1, l.realise[i.cle] / l.objectif[i.cle]));
  return taux.length ? taux.reduce((s, t) => s + t, 0) / taux.length : null;
}

type Niveau = "NON_FIXE" | "ATTEINT" | "BONNE_VOIE" | "SURVEILLER" | "RETARD";
function niveau(sc: number | null, avancement: number): Niveau {
  if (sc === null) return "NON_FIXE";
  if (sc >= 1) return "ATTEINT";
  if (sc >= avancement * 0.9) return "BONNE_VOIE";
  if (sc >= avancement * 0.6) return "SURVEILLER";
  return "RETARD";
}
const NIVEAUX: Record<Niveau, { label: string; badge: string; point: string; trait: string }> = {
  ATTEINT: { label: "Objectif atteint", badge: "bg-ok text-white", point: "bg-ok", trait: "stroke-ok" },
  BONNE_VOIE: { label: "En bonne voie", badge: "bg-ok/15 text-ok", point: "bg-ok/70", trait: "stroke-ok" },
  SURVEILLER: { label: "À surveiller", badge: "bg-warn/20 text-warn", point: "bg-warn", trait: "stroke-warn" },
  RETARD: { label: "En retard", badge: "bg-danger/10 text-danger", point: "bg-danger", trait: "stroke-danger" },
  NON_FIXE: { label: "Sans objectif", badge: "bg-bg-elevated text-ink-muted", point: "bg-line", trait: "stroke-line" },
};

/** Couleur d'une barre selon le rythme : on compare le taux réalisé au temps écoulé dans le mois. */
function couleurBarre(pct: number, avancement: number) {
  if (pct >= 100) return "bg-ok";
  if (pct >= avancement * 100 * 0.9) return "bg-ok/80";
  if (pct >= avancement * 100 * 0.6) return "bg-warn";
  return "bg-danger";
}

function Anneau({ valeur, classe }: { valeur: number | null; classe: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const p = valeur === null ? 0 : Math.min(1, valeur);
  return (
    <div className="relative h-14 w-14 shrink-0" aria-label={valeur === null ? "Sans objectif" : `Score global ${Math.round(valeur * 100)} %`} role="img">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={r} className="fill-none stroke-line" strokeWidth="5" />
        {valeur !== null && <circle cx="28" cy="28" r={r} className={`fill-none ${classe}`} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} />}
      </svg>
      <span className="montant absolute inset-0 flex items-center justify-center text-[13px] text-ink">{valeur === null ? "—" : `${Math.round(valeur * 100)}%`}</span>
    </div>
  );
}

/** Barre de progression avec un repère « où on devrait en être » (temps écoulé du mois). */
function Barre({ pct, avancement, hauteur = "h-2" }: { pct: number; avancement: number; hauteur?: string }) {
  return (
    <div className={`relative ${hauteur} w-full rounded-full bg-bg-elevated`}>
      <div className={`${hauteur} rounded-full transition-all ${couleurBarre(pct, avancement)}`} style={{ width: `${Math.min(100, pct)}%` }} />
      {avancement > 0 && avancement < 1 && (
        <span className="absolute -top-1 bottom-[-4px] w-0.5 rounded bg-ink/50" style={{ left: `${avancement * 100}%` }} title={`Rythme attendu : ${Math.round(avancement * 100)} %`} />
      )}
    </div>
  );
}

function Indicateur({ i, l, avancement }: { i: (typeof INDICATEURS)[number]; l: Ligne; avancement: number }) {
  const Icone = i.icone;
  const val = l.realise[i.cle];
  const cible = l.objectif[i.cle];
  const pct = cible > 0 ? Math.round((val / cible) * 100) : null;
  return (
    <div className="rounded-lg border border-line bg-bg-elevated/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
        <span className="flex items-center gap-1.5">
          <Icone className="h-3.5 w-3.5 text-brass" />
          {i.court}
        </span>
        {pct !== null && <span className={`font-bold ${pct >= 100 ? "text-ok" : "text-ink-muted"}`}>{pct} %</span>}
      </div>
      <p className="mt-1 text-ink">
        <span className="montant text-lg">{nb(val)}</span>
        {cible > 0 ? <span className="text-sm text-ink-muted"> / {nb(cible)}</span> : <span className="text-xs text-ink-muted"> · pas d'objectif</span>}
      </p>
      <div className="mt-2">{cible > 0 ? <Barre pct={pct ?? 0} avancement={avancement} hauteur="h-1.5" /> : <div className="h-1.5 w-full rounded-full bg-bg-elevated" />}</div>
    </div>
  );
}

export default function ObjectifsPage() {
  const ecriture = useEcriture("objectifs");
  const [mois, setMois] = useState(moisCourant());
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [avancement, setAvancement] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [filtre, setFiltre] = useState<Niveau | "TOUS">("TOUS");
  const [edition, setEdition] = useState<Ligne | null>(null);
  const [saisie, setSaisie] = useState<Record<Cle, string>>({ chiffreAffaires: "", nouveauxPv: "", visites: "", commandes: "", cartons: "" });
  const [enCours, setEnCours] = useState(false);
  const [erreurForm, setErreurForm] = useState("");
  const [reprise, setReprise] = useState(false);
  const [info, setInfo] = useState("");

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur("");
    try {
      const r = await fetch(`/api/objectifs?mois=${mois}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur de chargement.");
      setLignes(d.lignes);
      setAvancement(d.avancement);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }, [mois]);

  useEffect(() => {
    setFiltre("TOUS");
    setInfo("");
    charger();
  }, [charger]);

  const classement = useMemo(
    () => lignes.map((l) => ({ l, sc: score(l), n: niveau(score(l), avancement) })).sort((a, b) => (b.sc ?? -1) - (a.sc ?? -1)),
    [lignes, avancement]
  );
  const affiches = filtre === "TOUS" ? classement : classement.filter((x) => x.n === filtre);
  const compte = (n: Niveau) => classement.filter((x) => x.n === n).length;

  const totaux = useMemo(() => {
    const t = { objectif: 0, realise: 0 };
    for (const l of lignes) {
      t.objectif += l.objectif.chiffreAffaires;
      t.realise += l.realise.chiffreAffaires;
    }
    return t;
  }, [lignes]);
  const pctEquipe = totaux.objectif > 0 ? Math.round((totaux.realise / totaux.objectif) * 100) : null;
  const sansObjectif = lignes.filter((l) => !aDesObjectifs(l));

  function ouvrir(l: Ligne) {
    setEdition(l);
    setErreurForm("");
    setSaisie(Object.fromEntries(INDICATEURS.map((i) => [i.cle, l.objectif[i.cle] ? String(l.objectif[i.cle]) : ""])) as Record<Cle, string>);
  }

  async function enregistrer() {
    if (!edition) return;
    setEnCours(true);
    setErreurForm("");
    try {
      const corps = Object.fromEntries(INDICATEURS.map((i) => [i.cle, Number(saisie[i.cle] || 0)]));
      const r = await fetch("/api/objectifs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commercialId: edition.commercial.id, mois, ...corps }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Échec de l'enregistrement.");
      setEdition(null);
      await charger();
    } catch (e) {
      setErreurForm((e as Error).message);
    } finally {
      setEnCours(false);
    }
  }

  /** Objectifs du mois précédent d'un commercial (ou de tous ceux qui n'en ont pas). */
  async function objectifsPrecedents(): Promise<Map<string, Valeurs>> {
    const r = await fetch(`/api/objectifs?mois=${decaler(mois, -1)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Erreur de chargement.");
    return new Map((d.lignes as Ligne[]).filter(aDesObjectifs).map((l) => [l.commercial.id, l.objectif]));
  }

  async function reprendreDansFormulaire() {
    if (!edition) return;
    setErreurForm("");
    try {
      const o = (await objectifsPrecedents()).get(edition.commercial.id);
      if (!o) return setErreurForm(`Aucun objectif fixé en ${libelleMois(decaler(mois, -1))} pour ce commercial.`);
      setSaisie(Object.fromEntries(INDICATEURS.map((i) => [i.cle, o[i.cle] ? String(o[i.cle]) : ""])) as Record<Cle, string>);
    } catch (e) {
      setErreurForm((e as Error).message);
    }
  }

  async function reprendreTous() {
    setReprise(true);
    setInfo("");
    setErreur("");
    try {
      const prec = await objectifsPrecedents();
      let n = 0;
      for (const l of sansObjectif) {
        const o = prec.get(l.commercial.id);
        if (!o) continue;
        const r = await fetch("/api/objectifs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commercialId: l.commercial.id, mois, ...o }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Échec de la reprise.");
        n++;
      }
      setInfo(n ? `${n} commercial${n > 1 ? "ux" : ""} : objectifs repris de ${libelleMois(decaler(mois, -1))}.` : `Aucun objectif trouvé en ${libelleMois(decaler(mois, -1))}.`);
      await charger();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setReprise(false);
    }
  }

  const estCourant = mois === moisCourant();
  const restant = Math.max(0, totaux.objectif - totaux.realise);

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* En-tête */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-ink">
            <IconTarget className="h-6 w-6 text-brass" />
            Objectifs des commerciaux
          </h1>
          <p className="ml-1 text-sm text-ink-muted">Fixe les objectifs du mois et suis la réalisation de chaque commercial terrain.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-line bg-bg-card">
            <button className="px-3 py-2 text-ink-muted hover:text-brass" onClick={() => setMois(decaler(mois, -1))} aria-label="Mois précédent">
              <IconArrowRight className="h-4 w-4 rotate-180" />
            </button>
            <span className="min-w-[8.5rem] text-center text-sm font-bold capitalize text-ink">{libelleMois(mois)}</span>
            <button className="px-3 py-2 text-ink-muted hover:text-brass" onClick={() => setMois(decaler(mois, 1))} aria-label="Mois suivant">
              <IconArrowRight className="h-4 w-4" />
            </button>
          </div>
          {!estCourant && (
            <button className="btn-secondary !py-2 text-xs" onClick={() => setMois(moisCourant())}>
              Mois en cours
            </button>
          )}
        </div>
      </div>

      {/* Synthèse de l'équipe */}
      <section className="field-card mb-5 grid gap-5 !p-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Chiffre d'affaires de l'équipe</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="montant text-3xl text-ok">
              {nombreFr(totaux.realise)}
              <span className="montant-unite">FCFA</span>
            </p>
            <p className="text-sm text-ink-muted">
              {totaux.objectif > 0 ? (
                <>
                  sur <b className="text-ink">{nombreFr(totaux.objectif)} FCFA</b> d'objectif
                </>
              ) : (
                "aucun objectif de CA fixé"
              )}
            </p>
          </div>
          <div className="mt-3">
            <Barre pct={pctEquipe ?? 0} avancement={avancement} hauteur="h-3" />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-ink-muted">
            <span>
              {pctEquipe !== null ? (
                <b className="text-ink">{pctEquipe} % réalisé</b>
              ) : (
                "—"
              )}
              {totaux.objectif > 0 && (restant > 0 ? <> · il reste {nombreFr(restant)} FCFA</> : <> · objectif atteint</>)}
            </span>
            <span>
              {estCourant ? `Mois écoulé à ${Math.round(avancement * 100)} %` : avancement >= 1 ? "Mois terminé" : "Mois à venir"}
              {avancement > 0 && avancement < 1 && " · le trait marque le rythme attendu"}
            </span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Où en sont les commerciaux</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par situation">
            <button
              onClick={() => setFiltre("TOUS")}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${filtre === "TOUS" ? "border-brass bg-brass text-white" : "border-line bg-bg-card text-ink hover:border-brass"}`}
            >
              Tous · {classement.length}
            </button>
            {(["ATTEINT", "BONNE_VOIE", "SURVEILLER", "RETARD", "NON_FIXE"] as Niveau[]).map((n) =>
              compte(n) === 0 ? null : (
                <button
                  key={n}
                  onClick={() => setFiltre(filtre === n ? "TOUS" : n)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${filtre === n ? "border-brass bg-brass/10 text-ink" : "border-line bg-bg-card text-ink hover:border-brass"}`}
                >
                  <span className={`h-2 w-2 rounded-full ${NIVEAUX[n].point}`} />
                  {NIVEAUX[n].label} · {compte(n)}
                </button>
              )
            )}
          </div>
        </div>
      </section>

      {/* Reprise des objectifs du mois précédent */}
      {ecriture && !chargement && sansObjectif.length > 0 && lignes.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brass/30 bg-brass/5 px-4 py-3">
          <p className="text-sm text-ink">
            <b>{sansObjectif.length === lignes.length ? "Aucun objectif" : `${sansObjectif.length} commercial${sansObjectif.length > 1 ? "ux" : ""} sans objectif`}</b> pour {libelleMois(mois)}. Reprends ceux de {libelleMois(decaler(mois, -1))} en un clic, puis ajuste si besoin.
          </p>
          <button className="btn-primary !py-2 text-sm" onClick={reprendreTous} disabled={reprise}>
            {reprise ? <Spinner className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
            Reprendre le mois précédent
          </button>
        </div>
      )}
      {info && <p className="mb-4 rounded-lg border border-ok/30 bg-ok/10 px-4 py-2.5 text-sm font-medium text-ok">{info}</p>}
      {erreur && <p className="mb-3 text-sm text-danger">{erreur}</p>}
      {chargement && (
        <div className="flex justify-center py-12">
          <Spinner className="h-5 w-5" />
        </div>
      )}

      {/* Cartes commerciaux */}
      <div className="grid gap-4 xl:grid-cols-2">
        {!chargement &&
          affiches.map(({ l, sc, n }) => {
            const rang = classement.findIndex((x) => x.l.commercial.id === l.commercial.id) + 1;
            const ca = INDICATEURS[0];
            const caObj = l.objectif.chiffreAffaires;
            const caReal = l.realise.chiffreAffaires;
            const caPct = caObj > 0 ? Math.round((caReal / caObj) * 100) : null;
            const fixes = aDesObjectifs(l);
            return (
              <article key={l.commercial.id} className="field-card relative overflow-hidden !p-0">
                <span className={`absolute inset-y-0 left-0 w-1 ${NIVEAUX[n].point}`} aria-hidden />
                <header className="flex items-center gap-3 border-b border-line px-5 py-4">
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass/10 font-menu text-sm font-extrabold text-brass">
                    {initiales(l.commercial)}
                    {sc !== null && <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-line bg-bg-card px-1 text-[10px] font-extrabold text-ink">{rang}</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base text-ink">
                      {l.commercial.prenom} {l.commercial.nom}
                    </h2>
                    <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${NIVEAUX[n].badge}`}>{NIVEAUX[n].label}</span>
                  </div>
                  <Anneau valeur={sc} classe={NIVEAUX[n].trait} />
                </header>

                <div className="space-y-4 px-5 py-4">
                  {fixes ? (
                    <>
                      {/* Chiffre d'affaires : l'indicateur principal */}
                      <div>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">{ca.label}</p>
                          {caPct !== null && <p className={`text-sm font-extrabold ${caPct >= 100 ? "text-ok" : "text-ink"}`}>{caPct} %</p>}
                        </div>
                        <p className="mt-0.5 text-ink">
                          <span className="montant text-2xl">{nombreFr(caReal)}</span>
                          <span className="text-sm text-ink-muted"> {caObj > 0 ? `/ ${nombreFr(caObj)} FCFA` : "FCFA · pas d'objectif"}</span>
                        </p>
                        <div className="mt-2">{caObj > 0 ? <Barre pct={caPct ?? 0} avancement={avancement} hauteur="h-2.5" /> : <div className="h-2.5 w-full rounded-full bg-bg-elevated" />}</div>
                        {caObj > caReal && <p className="mt-1.5 text-xs font-medium text-ink-muted">Reste {nombreFr(caObj - caReal)} FCFA à réaliser</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {SECONDAIRES.map((i) => (
                          <Indicateur key={i.cle} i={i} l={l} avancement={avancement} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-ink-muted">Aucun objectif fixé pour {libelleMois(mois)}. Voici déjà ce qui a été réalisé :</p>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {INDICATEURS.map((i) => (
                          <div key={i.cle} className="rounded-lg border border-line bg-bg-elevated/50 px-3 py-2.5">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                              <i.icone className="h-3.5 w-3.5 text-brass" />
                              {i.court}
                            </p>
                            <p className="montant mt-1 text-lg text-ink">
                              {nb(l.realise[i.cle])}
                              {i.cle === "chiffreAffaires" && <span className="montant-unite">F</span>}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {ecriture && (
                  <footer className="border-t border-line bg-bg-elevated/40 px-5 py-3">
                    <button className={fixes ? "btn-secondary !py-1.5 text-xs" : "btn-primary !py-1.5 text-xs"} onClick={() => ouvrir(l)}>
                      <IconPencil className="h-4 w-4" />
                      {fixes ? "Modifier les objectifs" : "Fixer les objectifs"}
                    </button>
                  </footer>
                )}
              </article>
            );
          })}
      </div>

      {!chargement && !erreur && lignes.length === 0 && (
        <div className="field-card flex flex-col items-center gap-2 py-12 text-center text-sm text-ink-muted">
          <IconTrend className="h-6 w-6" />
          Aucun commercial actif.
        </div>
      )}
      {!chargement && lignes.length > 0 && affiches.length === 0 && (
        <p className="field-card py-8 text-center text-sm text-ink-muted">
          Personne dans cette situation ce mois-ci.{" "}
          <button className="font-bold text-brass hover:underline" onClick={() => setFiltre("TOUS")}>
            Voir tout le monde
          </button>
        </p>
      )}

      {/* Fenêtre de saisie */}
      {edition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" onClick={() => setEdition(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brass/10 font-menu text-sm font-extrabold text-brass">{initiales(edition.commercial)}</span>
                <div>
                  <h2 className="text-lg text-ink">
                    {edition.commercial.prenom} {edition.commercial.nom}
                  </h2>
                  <p className="text-xs font-medium capitalize text-ink-muted">Objectifs de {libelleMois(mois)}</p>
                </div>
              </div>
              <button aria-label="Fermer" onClick={() => setEdition(null)} className="rounded-md p-1 text-ink-muted hover:text-ink">
                <IconClose className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              {INDICATEURS.map((i) => {
                const val = Number(saisie[i.cle] || 0);
                const real = edition.realise[i.cle];
                return (
                  <label key={i.cle} className="block rounded-lg border border-line px-3 py-2.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                        <i.icone className="h-4 w-4 text-brass" />
                        {i.label}
                      </span>
                      <span className="text-[11px] font-medium text-ink-muted">Déjà réalisé : {nb(real)}{i.unite === "FCFA" ? " FCFA" : ""}</span>
                    </span>
                    <span className="mt-2 flex items-center gap-2">
                      <input
                        className="field-input"
                        inputMode="numeric"
                        value={saisie[i.cle]}
                        onChange={(e) => setSaisie({ ...saisie, [i.cle]: e.target.value.replace(/[^\d]/g, "") })}
                        placeholder="Pas d'objectif"
                      />
                      {i.unite === "FCFA" && <span className="shrink-0 text-sm text-ink-muted">FCFA</span>}
                    </span>
                    {val > 0 && i.unite === "FCFA" && <span className="mt-1 block text-xs font-semibold text-brass">{nombreFr(val)} FCFA</span>}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ink-muted">Laisse vide ou 0 pour ne pas fixer un indicateur.</p>

            {erreurForm && <p className="mt-3 text-sm text-danger">{erreurForm}</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="flex items-center gap-1.5 text-xs font-bold text-brass hover:underline" onClick={reprendreDansFormulaire}>
                <IconCopy className="h-4 w-4" />
                Reprendre {libelleMois(decaler(mois, -1))}
              </button>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setEdition(null)}>
                  Annuler
                </button>
                <button className="btn-primary" disabled={enCours} onClick={enregistrer}>
                  {enCours && <Spinner className="h-4 w-4" />}
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
