"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconTarget, IconPencil, IconClose, IconTrend } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { useEcriture } from "@/lib/useEcriture";
import { nombreFr } from "@/lib/format";

type Valeurs = { chiffreAffaires: number; nouveauxPv: number; visites: number; commandes: number; cartons: number };
type Ligne = { commercial: { id: string; nom: string; prenom: string }; objectif: Valeurs; realise: Valeurs };
type Cle = keyof Valeurs;

const INDICATEURS: { cle: Cle; label: string; unite: string }[] = [
  { cle: "chiffreAffaires", label: "Chiffre d'affaires", unite: "FCFA" },
  { cle: "nouveauxPv", label: "Nouveaux points de vente", unite: "" },
  { cle: "visites", label: "Visites", unite: "" },
  { cle: "commandes", label: "Commandes", unite: "" },
  { cle: "cartons", label: "Cartons vendus", unite: "" },
];

const moisCourant = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 7);
const libelleMois = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Score global = moyenne des taux de réalisation (plafonnés à 100 %) des indicateurs fixés. */
function score(l: Ligne) {
  const taux = INDICATEURS.filter((i) => l.objectif[i.cle] > 0).map((i) => Math.min(1, l.realise[i.cle] / l.objectif[i.cle]));
  return taux.length ? taux.reduce((s, t) => s + t, 0) / taux.length : null;
}

function niveau(sc: number | null, avancement: number) {
  if (sc === null) return { label: "Objectifs non fixés", cls: "bg-bg-elevated text-ink-muted" };
  if (sc >= 1) return { label: "Objectif atteint", cls: "bg-ok text-white" };
  if (sc >= avancement * 0.9) return { label: "En bonne voie", cls: "bg-ok/15 text-ok" };
  if (sc >= avancement * 0.6) return { label: "À surveiller", cls: "bg-warn/20 text-warn" };
  return { label: "En retard", cls: "bg-danger/10 text-danger" };
}

function Jauge({ valeur, cible, unite, label }: { valeur: number; cible: number; unite: string; label: string }) {
  const pct = cible > 0 ? Math.round((valeur / cible) * 100) : null;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold text-ink-muted">
        <span>{label}</span>
        <span className="text-ink">
          <span className="montant text-sm">{nombreFr(valeur)}</span>
          {cible > 0 ? <span className="text-ink-muted"> / {nombreFr(cible)} {unite}</span> : <span className="text-ink-muted"> {unite} · pas d'objectif</span>}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
        <div className={`h-2 rounded-full ${pct !== null && pct >= 100 ? "bg-ok" : "bg-brass"}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
      </div>
      {pct !== null && <p className="mt-0.5 text-right text-[11px] font-bold text-ink-muted">{pct} %</p>}
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
  const [edition, setEdition] = useState<Ligne | null>(null);
  const [saisie, setSaisie] = useState<Record<Cle, string>>({ chiffreAffaires: "", nouveauxPv: "", visites: "", commandes: "", cartons: "" });
  const [enCours, setEnCours] = useState(false);
  const [erreurForm, setErreurForm] = useState("");

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
    charger();
  }, [charger]);

  const classement = useMemo(
    () => lignes.map((l) => ({ l, sc: score(l) })).sort((a, b) => (b.sc ?? -1) - (a.sc ?? -1)),
    [lignes]
  );

  const totaux = useMemo(() => {
    const t = { objectif: 0, realise: 0 };
    for (const l of lignes) {
      t.objectif += l.objectif.chiffreAffaires;
      t.realise += l.realise.chiffreAffaires;
    }
    return t;
  }, [lignes]);

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

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-ink">
            <IconTarget className="h-6 w-6 text-brass" />
            Objectifs des commerciaux
          </h1>
          <p className="ml-1 text-sm text-ink-muted">Fixe les objectifs du mois et suis la réalisation de chaque commercial terrain.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
          Mois
          <input type="month" className="field-input w-auto" value={mois} onChange={(e) => e.target.value && setMois(e.target.value)} />
        </label>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="field-card !p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Période</p>
          <p className="mt-1 font-menu text-xl font-extrabold capitalize text-ink">{libelleMois(mois)}</p>
          <p className="text-xs font-medium text-ink-muted">Mois écoulé à {Math.round(avancement * 100)} %</p>
        </div>
        <div className="field-card !p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Objectif CA équipe</p>
          <p className="montant mt-1 text-2xl text-ink">{nombreFr(totaux.objectif)}<span className="montant-unite">FCFA</span></p>
        </div>
        <div className="field-card !p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">CA réalisé</p>
          <p className="montant mt-1 text-2xl text-ok">{nombreFr(totaux.realise)}<span className="montant-unite">FCFA</span></p>
        </div>
        <div className="field-card !p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Réalisation CA</p>
          <p className="montant mt-1 text-2xl text-brass">{totaux.objectif > 0 ? Math.round((totaux.realise / totaux.objectif) * 100) : 0} %</p>
        </div>
      </div>

      {erreur && <p className="mb-3 text-sm text-danger">{erreur}</p>}
      {chargement && (
        <div className="flex justify-center py-12"><Spinner className="h-5 w-5" /></div>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {!chargement &&
          classement.map(({ l, sc }, rang) => {
            const n = niveau(sc, avancement);
            return (
              <article key={l.commercial.id} className="field-card">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brass/10 font-menu text-sm font-extrabold text-brass">{rang + 1}</span>
                    <div>
                      <h2 className="text-base text-ink">{l.commercial.prenom} {l.commercial.nom}</h2>
                      <p className="text-xs font-medium text-ink-muted">
                        {sc === null ? "—" : <>Score global <span className="montant text-sm text-ink">{Math.round(sc * 100)} %</span></>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${n.cls}`}>{n.label}</span>
                    {ecriture && (
                      <button className="btn-secondary !px-2.5 !py-1.5 text-xs" onClick={() => ouvrir(l)}>
                        <IconPencil className="h-4 w-4" />
                        Objectifs
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {INDICATEURS.map((i) => (
                    <Jauge key={i.cle} label={i.label} unite={i.unite} valeur={l.realise[i.cle]} cible={l.objectif[i.cle]} />
                  ))}
                </div>
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

      {edition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" onClick={() => setEdition(null)}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg text-ink">Objectifs — {edition.commercial.prenom} {edition.commercial.nom}</h2>
                <p className="text-xs font-medium capitalize text-ink-muted">{libelleMois(mois)} · laisse vide ou 0 pour ne pas fixer l'indicateur</p>
              </div>
              <button aria-label="Fermer" onClick={() => setEdition(null)} className="rounded-md p-1 text-ink-muted hover:text-ink"><IconClose className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              {INDICATEURS.map((i) => (
                <label key={i.cle} className="block">
                  <span className="field-label">{i.label} {i.unite && `(${i.unite})`}</span>
                  <input
                    className="field-input"
                    inputMode="numeric"
                    value={saisie[i.cle]}
                    onChange={(e) => setSaisie({ ...saisie, [i.cle]: e.target.value.replace(/[^\d]/g, "") })}
                    placeholder="0"
                  />
                </label>
              ))}
            </div>
            {erreurForm && <p className="mt-3 text-sm text-danger">{erreurForm}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEdition(null)}>Annuler</button>
              <button className="btn-primary" disabled={enCours} onClick={enregistrer}>
                {enCours && <Spinner className="h-4 w-4" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
