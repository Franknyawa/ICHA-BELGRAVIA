"use client";

import { useEffect, useMemo, useState } from "react";
import { IconBox, IconCalendar, IconCheckCircle, IconClock, IconDownload, IconPrinter, IconReceipt, IconStorefront, IconTrend, IconWallet, IconRoute } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { nombreFr } from "@/lib/format";
import { formaterCartons } from "@/lib/quantites";
import { genererTableauDeBordPdf } from "@/lib/tableauDeBordPdf";

export type ActiviteJour = {
  date: string;
  gammes: { id: string; code: string; nom: string }[];
  kpi: {
    pointsVisites: number;
    pointsVisitesHier: number;
    moyennePoints7j: number;
    visites: number;
    ventesValidees: number;
    cartonsValides: number;
    livrees: number;
    aLivrer: number;
    chiffreAffaires: number;
    encaisse: number;
    depenses: number;
    enAttente: number;
    enAttenteMontant: number;
    livraisonsAVenir: number;
  };
  cartes: { id: string; code: string; nom: string; jour: number; semaine: number; mois: number; total: number; produits: { id: string; nom: string; total: number; mois: number }[] }[];
  totalGeneral: number;
  jourCommandes: {
    validees: { commandes: number; cartons: number; montant: number };
    livrees: { commandes: number; montant: number };
    aLivrer: { commandes: number; montant: number };
    enAttente: { commandes: number; montant: number };
    anterieuresALivrer: { commandes: number; cartons: number; montant: number };
  };
  tableau: { jour: string; cartons: number; parGamme: Record<string, number>; commandes: number; facture: number }[];
};

const fcfa = (n: number) => `${nombreFr(Math.round(n))} FCFA`;
const ct = (n: number) => `${formaterCartons(n)} carton${n > 1 ? "s" : ""}`;
const TEINTES = ["bg-brass", "bg-ok", "bg-warn"];

const jourCourt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
const dateLongue = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** En-tête du tableau de bord + activité du jour : indicateurs, cartons par gamme, commandes du jour, ventes sur 14 jours. */
export default function ActiviteDuJour({ gammeId, filtre }: { gammeId: string; filtre?: React.ReactNode }) {
  const [d, setD] = useState<ActiviteJour | null>(null);
  const [prenom, setPrenom] = useState("");
  const [pdf, setPdf] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((m) => setPrenom(m?.prenom || "")).catch(() => {});
  }, []);
  useEffect(() => {
    setD(null);
    fetch(`/api/tableau-de-bord/jour${gammeId ? `?gammeId=${encodeURIComponent(gammeId)}` : ""}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => {});
  }, [gammeId]);

  const synthese = useMemo(() => {
    if (!d) return null;
    const total = d.tableau.reduce((s, t) => s + t.cartons, 0);
    const cmd = d.tableau.reduce((s, t) => s + t.commandes, 0);
    const max = Math.max(1, ...d.tableau.map((t) => t.cartons));
    const meilleur = d.tableau.reduce((a, t) => (t.cartons > a.cartons ? t : a), d.tableau[0]);
    const aujourdhui = d.tableau[d.tableau.length - 1]?.cartons || 0;
    const hier = d.tableau[d.tableau.length - 2]?.cartons || 0;
    return { total, cmd, max, meilleur, aujourdhui, hier, facture: d.tableau.reduce((s, t) => s + t.facture, 0) };
  }, [d]);

  async function telecharger() {
    if (!d) return;
    setPdf(true);
    try {
      await genererTableauDeBordPdf(d, prenom, majuscule(dateLongue(d.date)));
    } finally {
      setPdf(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Bonjour{prenom ? ` ${prenom}` : ""}</h1>
          <p className="text-sm text-ink-muted">{d ? `${majuscule(dateLongue(d.date))} — activité du jour` : "Activité du jour"}</p>
        </div>
        <div className="no-print flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => window.print()} disabled={!d}>
            <IconPrinter className="h-4 w-4" />
            Imprimer
          </button>
          <button type="button" className="btn-secondary" onClick={telecharger} disabled={!d || pdf}>
            {pdf ? <Spinner className="h-4 w-4" /> : <IconDownload className="h-4 w-4" />}
            Télécharger PDF
          </button>
        </div>
      </div>

      {filtre && <div className="no-print mb-6">{filtre}</div>}

      {!d && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="field-card h-28 animate-pulse bg-bg-elevated/60" />
          ))}
        </div>
      )}

      {d && synthese && (
        <>
          <Titre>Aujourd'hui</Titre>
          <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Carte icone={IconStorefront} ton="ok" titre="Points visités" valeur={d.kpi.pointsVisites}
              note={ecart(d.kpi.pointsVisites, d.kpi.pointsVisitesHier, "hier")} />
            <Carte icone={IconRoute} ton="brass" titre="Visites réalisées" valeur={d.kpi.visites}
              note={`moyenne ${nombreFr(d.kpi.moyennePoints7j)} points / jour sur 7 jours`} />
            <Carte icone={IconCheckCircle} ton="ok" titre="Ventes validées" valeur={d.kpi.ventesValidees}
              note={`${ct(d.kpi.cartonsValides)} · ${d.kpi.livrees} livrée(s), ${d.kpi.aLivrer} à livrer`} />
            <Carte icone={IconReceipt} ton="brass" titre="Chiffre d'affaires" valeur={fcfa(d.kpi.chiffreAffaires)} note="ventes validées du jour, nettes d'avoirs" />
            <Carte icone={IconWallet} ton="ok" titre="Encaissé en caisse" valeur={fcfa(d.kpi.encaisse)} note={`dépenses du jour : ${fcfa(d.kpi.depenses)}`} />
            <Carte icone={IconClock} ton="danger" titre="Commandes en attente" valeur={d.kpi.enAttente}
              note={`${fcfa(d.kpi.enAttenteMontant)} à valider · ${d.kpi.livraisonsAVenir} livraison(s) à venir`} />
          </div>

          <Titre>Cartons vendus par gamme</Titre>
          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            {d.cartes.map((c, i) => (
              <section key={c.id} className="field-card overflow-hidden !p-0">
                <header className="flex items-center justify-between gap-3 border-b border-line bg-brass/5 px-5 py-3">
                  <span className="flex items-center gap-2 font-bold text-ink">
                    <IconBox className="h-4 w-4 text-brass" />
                    {c.nom}
                  </span>
                  <span className="text-xs font-bold text-ink-muted">{d.totalGeneral ? Math.round((c.total / d.totalGeneral) * 1000) / 10 : 0} % des cartons</span>
                </header>
                <div className="px-5 py-4">
                  <p className="montant text-5xl text-ink">{formaterCartons(c.total)}</p>
                  <p className="mt-1 text-xs text-ink-muted">cartons vendus depuis le début</p>
                  <dl className="mt-4 divide-y divide-line text-sm">
                    <Ligne l="Aujourd'hui" v={ct(c.jour)} />
                    <Ligne l="Cette semaine" v={ct(c.semaine)} />
                    <Ligne l="Ce mois" v={ct(c.mois)} />
                  </dl>
                  {c.produits.length > 0 && (
                    <ul className="mt-4 space-y-2 border-t border-line pt-4">
                      {c.produits.map((p) => (
                        <li key={p.id}>
                          <div className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="truncate text-ink">{p.nom}</span>
                            <span className="shrink-0 font-bold text-ink">{formaterCartons(p.total)}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                            <div className={`h-full rounded-full ${TEINTES[i % TEINTES.length]}`} style={{ width: `${c.total ? (p.total / c.total) * 100 : 0}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ))}
          </div>

          <Titre>Commandes de la journée</Titre>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Carte petit icone={IconReceipt} ton="brass" titre="Validées aujourd'hui" valeur={d.jourCommandes.validees.commandes}
              note={`${ct(d.jourCommandes.validees.cartons)} · ${fcfa(d.jourCommandes.validees.montant)}`} />
            <Carte petit icone={IconCheckCircle} ton="ok" titre="Déjà livrées" valeur={d.jourCommandes.livrees.commandes} note={`${fcfa(d.jourCommandes.livrees.montant)} · stock sorti`} />
            <Carte petit icone={IconBox} ton="warn" titre="À livrer" valeur={d.jourCommandes.aLivrer.commandes} note={`${fcfa(d.jourCommandes.aLivrer.montant)} · en attente de livraison`} />
            <Carte petit icone={IconClock} ton="danger" titre="En attente de validation" valeur={d.jourCommandes.enAttente.commandes} note={`${fcfa(d.jourCommandes.enAttente.montant)} · à valider`} />
          </div>
          <p className="mb-8 rounded-md border border-line bg-bg-card px-4 py-2.5 text-sm text-ink-muted">
            <b className="text-ink">Validées avant aujourd'hui, encore à livrer :</b> {d.jourCommandes.anterieuresALivrer.commandes} cmd · {ct(d.jourCommandes.anterieuresALivrer.cartons)} · {fcfa(d.jourCommandes.anterieuresALivrer.montant)}
          </p>

          <Titre>Ventes par jour : cartons</Titre>
          <p className="-mt-2 mb-3 text-xs text-ink-muted">Commandes enregistrées chaque jour sur les 14 derniers jours, en cartons (fractions de carton comprises).</p>
          <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Carte petit icone={IconBox} ton="brass" titre="Total 14 jours" valeur={ct(synthese.total)} note={`${synthese.cmd} commandes · ${fcfa(synthese.facture)}`} />
            <Carte petit icone={IconTrend} ton="ok" titre="Moyenne par jour" valeur={ct(Math.round((synthese.total / 14) * 10) / 10)} note="sur 14 jours" />
            <Carte petit icone={IconCalendar} ton="warn" titre="Meilleur jour" valeur={ct(synthese.meilleur?.cartons || 0)} note={synthese.meilleur ? jourCourt(synthese.meilleur.jour) : ""} />
            <Carte petit icone={IconTrend} ton="ok" titre="Aujourd'hui vs hier" valeur={`${synthese.aujourdhui - synthese.hier >= 0 ? "+" : "−"}${formaterCartons(Math.abs(synthese.aujourdhui - synthese.hier))}`} note={`${formaterCartons(synthese.aujourdhui)} aujourd'hui · ${formaterCartons(synthese.hier)} hier`} />
          </div>
          <div className="field-card mb-8 overflow-x-auto !p-0">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm tabular-nums print:min-w-0 print:text-[10px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="border-b border-line bg-bg-elevated px-4 py-3 font-medium">Jour</th>
                  <th className="w-[26%] border-b border-line bg-bg-elevated px-4 py-3 font-medium">Cartons</th>
                  {d.gammes.map((g) => (
                    <th key={g.id} className="border-b border-line bg-bg-elevated px-3 py-3 text-right font-medium">{g.nom}</th>
                  ))}
                  <th className="border-b border-line bg-bg-elevated px-3 py-3 text-right font-medium text-brass">Total</th>
                  <th className="border-b border-line bg-bg-elevated px-3 py-3 text-right font-medium">Cmd</th>
                  <th className="border-b border-line bg-bg-elevated px-4 py-3 text-right font-medium">Facturé</th>
                </tr>
              </thead>
              <tbody>
                {[...d.tableau].reverse().map((t, i) => (
                  <tr key={t.jour} className={i === 0 ? "bg-brass/5" : ""}>
                    <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-ink">{i === 0 ? `Aujourd'hui · ${jourCourt(t.jour)}` : jourCourt(t.jour)}</td>
                    <td className="border-b border-line px-4 py-2.5">
                      <div className="h-2 overflow-hidden rounded-full bg-line">
                        <div className="flex h-full" style={{ width: `${(t.cartons / synthese.max) * 100}%` }}>
                          {d.gammes.map((g, gi) => (
                            <div key={g.id} className={TEINTES[gi % TEINTES.length]} style={{ width: `${t.cartons ? ((t.parGamme[g.id] || 0) / t.cartons) * 100 : 0}%` }} />
                          ))}
                        </div>
                      </div>
                    </td>
                    {d.gammes.map((g) => (
                      <td key={g.id} className="border-b border-line px-3 py-2.5 text-right text-ink-muted">{t.parGamme[g.id] ? formaterCartons(t.parGamme[g.id]) : "—"}</td>
                    ))}
                    <td className="border-b border-line px-3 py-2.5 text-right font-bold text-ink">{t.cartons ? formaterCartons(t.cartons) : "—"}</td>
                    <td className="border-b border-line px-3 py-2.5 text-right text-ink">{t.commandes || "—"}</td>
                    <td className="border-b border-line px-4 py-2.5 text-right text-ink">{t.facture ? nombreFr(Math.round(t.facture)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold text-ink">
                  <td className="px-4 py-3">Total 14 jours</td>
                  <td />
                  {d.gammes.map((g) => (
                    <td key={g.id} className="px-3 py-3 text-right">{formaterCartons(d.tableau.reduce((s, t) => s + (t.parGamme[g.id] || 0), 0))}</td>
                  ))}
                  <td className="px-3 py-3 text-right text-brass">{formaterCartons(synthese.total)}</td>
                  <td className="px-3 py-3 text-right">{synthese.cmd}</td>
                  <td className="px-4 py-3 text-right">{nombreFr(Math.round(synthese.facture))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mb-8 flex flex-wrap gap-4 text-xs text-ink-muted">
            {d.gammes.map((g, i) => (
              <span key={g.id} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${TEINTES[i % TEINTES.length]}`} />
                {g.nom}
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ecart(auj: number, hier: number, ref: string) {
  const e = auj - hier;
  if (e === 0) return `identique à ${ref} (${hier})`;
  return `${e > 0 ? "+" : "−"}${Math.abs(e)} par rapport à ${ref} (${hier})`;
}

function Titre({ children }: { children: React.ReactNode }) {
  return <p className="section-eyebrow mb-3">{children}</p>;
}

function Ligne({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-ink-muted">{l}</dt>
      <dd className="font-bold text-ink">{v}</dd>
    </div>
  );
}

const TONS = {
  brass: "bg-brass/10 text-brass",
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
};

function Carte({
  icone: Icone,
  ton,
  titre,
  valeur,
  note,
  petit,
}: {
  icone: (p: { className?: string }) => JSX.Element;
  ton: keyof typeof TONS;
  titre: string;
  valeur: string | number;
  note?: string;
  petit?: boolean;
}) {
  return (
    <div className="field-card flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{titre}</p>
        <p className={`montant mt-1.5 text-ink ${petit ? "text-2xl" : "text-3xl"}`}>{valeur}</p>
        {note && <p className={`mt-1.5 text-xs ${ton === "danger" ? "text-danger" : "text-ink-muted"}`}>{note}</p>}
      </div>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONS[ton]}`}>
        <Icone className="h-[18px] w-[18px]" />
      </span>
    </div>
  );
}
