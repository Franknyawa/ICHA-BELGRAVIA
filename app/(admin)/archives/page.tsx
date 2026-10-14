"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconArchive, IconCalendar, IconDownload, IconRefresh, IconCheckCircle, IconAlert, IconArrowRight } from "@/components/icons";
import { Spinner, ChargementPage } from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import FactureButton from "@/components/FactureButton";

type Type = "visites" | "commandes" | "mouvements";
type Compteurs = Record<Type, number>;
type Etat = {
  config: { jours: number; auto: boolean };
  joursApercu: number;
  aArchiver: Compteurs;
  archives: Compteurs;
  dernier: { date: string; jours: number; auto: boolean; compteurs: Compteurs } | null;
};
type Item = {
  id: string;
  date: string;
  archiveeLe: string | null;
  titre: string;
  detail: string;
  agent: string;
  info: string;
  lien?: string;
  commande?: Parameters<typeof FactureButton>[0]["commande"];
};

const LIBELLES: Record<Type, string> = { visites: "Visites", commandes: "Commandes", mouvements: "Mouvements de stock" };
const DUREES = [30, 60, 90, 180, 365];

export default function ArchivesPage() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [jours, setJours] = useState(90);
  const [auto, setAuto] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState<{ ton: "ok" | "danger"; texte: string } | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [archivageEnCours, setArchivageEnCours] = useState(false);

  const [type, setType] = useState<Type>("visites");
  const [q, setQ] = useState("");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [restauration, setRestauration] = useState(false);

  const chargerEtat = useCallback(async (j?: number) => {
    const res = await fetch(`/api/archivage${j ? `?jours=${j}` : ""}`);
    if (!res.ok) return;
    const d: Etat = await res.json();
    setEtat(d);
    return d;
  }, []);

  useEffect(() => {
    chargerEtat().then((d) => {
      if (d) {
        setJours(d.config.jours);
        setAuto(d.config.auto);
      }
    });
  }, [chargerEtat]);

  // Aperçu en direct quand la durée change (anti-rafale).
  useEffect(() => {
    if (!etat || jours < 7 || jours === etat.joursApercu) return;
    const t = setTimeout(() => chargerEtat(jours), 400);
    return () => clearTimeout(t);
  }, [jours, etat, chargerEtat]);

  const paramsListe = useCallback(
    (p: number, csv = false) => {
      const s = new URLSearchParams({ type, page: String(p) });
      if (q) s.set("q", q);
      if (du) s.set("du", du);
      if (au) s.set("au", au);
      if (csv) s.set("format", "csv");
      return s.toString();
    },
    [type, q, du, au]
  );

  const chargerListe = useCallback(
    async (p: number) => {
      setChargement(true);
      try {
        const res = await fetch(`/api/archivage/donnees?${paramsListe(p)}`);
        const d = await res.json();
        setItems(d.items || []);
        setTotal(d.total || 0);
      } finally {
        setChargement(false);
      }
    },
    [paramsListe]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setSelection(new Set());
      chargerListe(1);
    }, 300);
    return () => clearTimeout(t);
  }, [chargerListe]);

  async function sauvegarderReglage() {
    setEnregistrement(true);
    setMessage(null);
    try {
      const res = await fetch("/api/archivage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jours, auto }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ ton: "danger", texte: d.error || "Enregistrement impossible." });
      else {
        setMessage({ ton: "ok", texte: "Réglage enregistré." });
        chargerEtat();
      }
    } finally {
      setEnregistrement(false);
    }
  }

  async function archiverMaintenant() {
    setArchivageEnCours(true);
    setMessage(null);
    try {
      // On enregistre d'abord la durée affichée pour archiver exactement ce qui est annoncé.
      const r1 = await fetch("/api/archivage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jours, auto }),
      });
      if (!r1.ok) throw new Error();
      const res = await fetch("/api/archivage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archiver" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error();
      const c: Compteurs = d.compteurs;
      setMessage({ ton: "ok", texte: `Archivé : ${c.visites} visite(s), ${c.commandes} commande(s), ${c.mouvements} mouvement(s) de stock.` });
      await chargerEtat();
      chargerListe(1);
    } catch {
      setMessage({ ton: "danger", texte: "L'archivage a échoué. Réessayez." });
    } finally {
      setArchivageEnCours(false);
      setConfirmer(false);
    }
  }

  async function restaurer(ids: string[]) {
    setRestauration(true);
    try {
      const res = await fetch("/api/archivage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restaurer", type, ids }),
      });
      if (!res.ok) throw new Error();
      setSelection(new Set());
      setMessage({ ton: "ok", texte: `${ids.length} élément(s) restauré(s) dans les listes courantes.` });
      await chargerEtat();
      chargerListe(page);
    } catch {
      setMessage({ ton: "danger", texte: "La restauration a échoué." });
    } finally {
      setRestauration(false);
    }
  }

  function basculer(id: string) {
    const n = new Set(selection);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelection(n);
  }

  const totalAArchiver = etat ? etat.aArchiver.visites + etat.aArchiver.commandes + etat.aArchiver.mouvements : 0;
  const debut = total === 0 ? 0 : (page - 1) * 20 + 1;
  const fin = Math.min(page * 20, total);
  const joursValide = Number.isFinite(jours) && jours >= 7 && jours <= 3650;
  const toutSelectionne = items.length > 0 && items.every((i) => selection.has(i.id));

  if (!etat) return <ChargementPage label="Chargement des archives…" />;

  return (
    <div className="pb-16">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconArchive className="h-5 w-5 text-brass" />
          Archives
        </h1>
        <p className="text-sm text-ink-muted">
          Les données plus anciennes que la durée de conservation quittent les listes courantes, mais ne sont jamais supprimées :
          vous pouvez les consulter, les exporter et les restaurer ici. Les statistiques, rapports et le solde de caisse continuent de les compter.
        </p>
      </div>

      {message && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            message.ton === "ok" ? "border-ok/30 bg-ok/10 text-ok" : "border-danger/30 bg-danger/10 text-danger"
          }`}
          role="status"
        >
          {message.ton === "ok" ? <IconCheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <IconAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />}
          {message.texte}
        </div>
      )}

      <div className="mb-8 grid items-start gap-4 lg:grid-cols-2">
        <div className="field-card">
          <p className="section-eyebrow mb-3">
            <IconCalendar className="h-4 w-4" />
            Durée de conservation
          </p>
          <p className="mb-3 text-sm text-ink-muted">Les données de plus de cette durée sont archivées.</p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {DUREES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setJours(d)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  jours === d ? "border-brass bg-brass text-white" : "border-line text-ink-muted hover:border-brass hover:text-brass"
                }`}
              >
                {d === 365 ? "1 an" : `${d} jours`}
              </button>
            ))}
            <label className="ml-1 flex items-center gap-1.5 text-xs text-ink-muted">
              Autre
              <input
                type="number"
                min={7}
                max={3650}
                className="field-input w-[90px]"
                value={Number.isFinite(jours) ? jours : ""}
                onChange={(e) => setJours(parseInt(e.target.value, 10))}
              />
              jours
            </label>
          </div>
          {!joursValide && <p className="mb-2 text-xs text-danger">Choisissez entre 7 et 3 650 jours.</p>}

          <label className="mb-4 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#a67c23]" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span>
              Archivage automatique chaque nuit
              <span className="block text-xs text-ink-muted">Nécessite la variable CRON_SECRET sur Vercel (voir les instructions de mise en ligne).</span>
            </span>
          </label>
          <button className="btn-secondary" disabled={enregistrement || !joursValide} onClick={sauvegarderReglage}>
            {enregistrement && <Spinner className="h-4 w-4" />}
            Enregistrer le réglage
          </button>
        </div>

        <div className="field-card">
          <p className="section-eyebrow mb-3">
            <IconArchive className="h-4 w-4" />
            Archiver maintenant
          </p>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            {(Object.keys(LIBELLES) as Type[]).map((t) => (
              <div key={t} className="rounded-lg bg-bg-elevated px-2 py-2.5">
                <p className="font-display text-xl text-ink">{etat.aArchiver[t]}</p>
                <p className="text-[11px] text-ink-muted">{LIBELLES[t]}</p>
              </div>
            ))}
          </div>
          <p className="mb-3 text-xs text-ink-muted">
            À archiver avec {etat.joursApercu} jours de conservation. Seules les commandes livrées et entièrement payées sont archivées.
          </p>
          <button className="btn-primary" disabled={totalAArchiver === 0 || !joursValide || archivageEnCours} onClick={() => setConfirmer(true)}>
            {archivageEnCours && <Spinner className="h-4 w-4" />}
            Archiver {totalAArchiver > 0 ? `${totalAArchiver} élément${totalAArchiver > 1 ? "s" : ""}` : "(rien à archiver)"}
          </button>
          {etat.dernier && (
            <p className="mt-3 text-xs text-ink-muted">
              Dernier archivage {etat.dernier.auto ? "automatique" : "manuel"} : {new Date(etat.dernier.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} (
              {etat.dernier.compteurs.visites} visites, {etat.dernier.compteurs.commandes} commandes, {etat.dernier.compteurs.mouvements} mouvements).
            </p>
          )}
        </div>
      </div>

      <p className="section-eyebrow mb-3">Consulter les archives</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(LIBELLES) as Type[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              type === t ? "border-brass bg-brass text-white" : "border-line text-ink-muted hover:border-brass hover:text-brass"
            }`}
          >
            {LIBELLES[t]} <span className="ml-1 opacity-80">({etat.archives[t]})</span>
          </button>
        ))}
      </div>

      <div className="field-card mb-4 flex flex-wrap items-center gap-2">
        <input className="field-input max-w-[240px]" placeholder={type === "mouvements" ? "Produit…" : "Établissement…"} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          Du
          <input type="date" className="field-input w-[150px]" value={du} max={au || undefined} onChange={(e) => setDu(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          au
          <input type="date" className="field-input w-[150px]" value={au} min={du || undefined} onChange={(e) => setAu(e.target.value)} />
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          {selection.size > 0 && (
            <button className="btn-primary" disabled={restauration} onClick={() => restaurer([...selection])}>
              {restauration ? <Spinner className="h-4 w-4" /> : <IconRefresh className="h-4 w-4" />}
              Restaurer la sélection ({selection.size})
            </button>
          )}
          <a className="btn-secondary" href={`/api/archivage/donnees?${paramsListe(1, true)}`}>
            <IconDownload className="h-4 w-4" />
            Exporter en CSV
          </a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-left text-ink-muted">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Tout sélectionner"
                  className="h-4 w-4 accent-[#a67c23]"
                  checked={toutSelectionne}
                  onChange={() => setSelection(toutSelectionne ? new Set() : new Set(items.map((i) => i.id)))}
                />
              </th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">{type === "mouvements" ? "Produit" : "Établissement"}</th>
              <th className="px-4 py-3 font-medium">Détail</th>
              {type !== "mouvements" && <th className="px-4 py-3 font-medium">Agent</th>}
              <th className="px-4 py-3 font-medium">Information</th>
              <th className="px-4 py-3 font-medium">Archivé le</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {chargement && (
              <tr>
                <td colSpan={8}>
                  <ChargementPage compact label="Chargement…" />
                </td>
              </tr>
            )}
            {!chargement &&
              items.map((i) => (
                <tr key={i.id} className="border-t border-line transition-colors hover:bg-bg-elevated">
                  <td className="px-4 py-3">
                    <input type="checkbox" aria-label="Sélectionner" className="h-4 w-4 accent-[#a67c23]" checked={selection.has(i.id)} onChange={() => basculer(i.id)} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{new Date(i.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-4 py-3 font-medium text-ink">{i.titre}</td>
                  <td className="px-4 py-3 text-ink-muted">{i.detail}</td>
                  {type !== "mouvements" && <td className="px-4 py-3 text-ink-muted">{i.agent}</td>}
                  <td className="px-4 py-3 text-ink-muted">{i.info}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{i.archiveeLe ? new Date(i.archiveeLe).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {i.lien && (
                        <Link href={i.lien} className="inline-flex rounded-md p-1.5 text-ink-muted hover:bg-brass/10 hover:text-brass" aria-label="Voir le détail" title="Voir le détail">
                          <IconArrowRight className="h-4 w-4" />
                        </Link>
                      )}
                      {i.commande && <FactureButton commande={i.commande} />}
                      <button
                        type="button"
                        onClick={() => restaurer([i.id])}
                        disabled={restauration}
                        className="inline-flex rounded-md p-1.5 text-ink-muted hover:bg-ok/10 hover:text-ok disabled:opacity-50"
                        aria-label="Restaurer"
                        title="Restaurer dans les listes courantes"
                      >
                        <IconRefresh className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            {!chargement && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">
                  Aucune donnée archivée ne correspond.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-sm text-ink-muted">
            {debut}–{fin} sur {total}
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); chargerListe(p); }}>
              Précédent
            </button>
            <button className="btn-secondary" disabled={page * 20 >= total} onClick={() => { const p = page + 1; setPage(p); chargerListe(p); }}>
              Suivant
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmer}
        title="Archiver ces données ?"
        message={`${etat.aArchiver.visites} visite(s), ${etat.aArchiver.commandes} commande(s) et ${etat.aArchiver.mouvements} mouvement(s) de stock de plus de ${etat.joursApercu} jours quitteront les listes courantes. Rien n'est supprimé : vous pourrez tout retrouver et restaurer ici.`}
        confirmLabel="Archiver"
        cancelLabel="Annuler"
        danger={false}
        pending={archivageEnCours}
        onConfirm={archiverMaintenant}
        onCancel={() => setConfirmer(false)}
      />
    </div>
  );
}
