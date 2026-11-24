"use client";

import { useCallback, useEffect, useState } from "react";
import { IconReceipt, IconDownload, IconRefresh } from "@/components/icons";
import { Spinner, ChargementPage } from "@/components/Spinner";
import ModaleAvoirRetour, { type FactureEmettable } from "@/components/ModaleAvoirRetour";
import { useEcriture } from "@/lib/useEcriture";
import { libelleModePaiement } from "@/lib/pricing";
import { nombreFr } from "@/lib/format";
import { telechargerDocumentCorrectif, telechargerFactureVente, type DocumentCorrectifListe } from "@/lib/facturationPdf";

type PV = {
  nomEtablissement: string;
  nomVendeur: string | null;
  nomPatron: string | null;
  quartier: string | null;
  ville: { nom: string } | null;
};
type Commercial = { id: string; nom: string; prenom: string };
type DocRef = { id: string; type: "FR" | "FA"; numero: string; montant: number };
type ItemFV = FactureEmettable & {
  numeroBC: string | null;
  numeroBL: string | null;
  pointVente: PV;
  commercial: Commercial;
  documentsCorrectifs: DocRef[];
};
type ItemDoc = DocumentCorrectifListe & { id: string; commande: DocumentCorrectifListe["commande"] & { id: string; pointVente: PV } };
type Onglet = "FV" | "FA" | "FR";
type Reponse = { total: number; pageSize: number; totaux: Record<string, number>; items: (ItemFV | ItemDoc)[] };

const VIDE = { q: "", typeId: "", commercialId: "", villeId: "", dateFrom: "", dateTo: "" };
const ONGLETS: { id: Onglet; label: string }[] = [
  { id: "FV", label: "Factures" },
  { id: "FA", label: "Factures d'avoir (FA)" },
  { id: "FR", label: "Factures retour (FR)" },
];

const interlocuteur = (p: PV) => p.nomVendeur || p.nomPatron || "—";
const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" });

export default function FacturationPage() {
  const ecriture = useEcriture("commandes");
  const [onglet, setOnglet] = useState<Onglet>("FV");
  const [brouillon, setBrouillon] = useState(VIDE);
  const [filtres, setFiltres] = useState(VIDE);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Reponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [agents, setAgents] = useState<Commercial[]>([]);
  const [ref, setRef] = useState<{ villes: { id: string; nom: string }[]; types: { id: string; nom: string }[] } | null>(null);
  const [cible, setCible] = useState<ItemFV | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const s = new URLSearchParams({ tab: onglet, page: String(page) });
      for (const [k, v] of Object.entries(filtres)) if (v) s.set(k, v);
      const res = await fetch(`/api/facturation?${s}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Chargement impossible.");
      setData(await res.json());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setChargement(false);
    }
  }, [onglet, page, filtres]);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    fetch("/api/utilisateurs?role=COMMERCIAL").then((r) => r.json()).then((d) => setAgents(d.users || [])).catch(() => {});
    fetch("/api/referentiels").then((r) => r.json()).then(setRef).catch(() => {});
  }, []);

  function appliquer() {
    setPage(1);
    setFiltres(brouillon);
  }
  function reinitialiser() {
    setBrouillon(VIDE);
    setFiltres(VIDE);
    setPage(1);
  }
  function changerOnglet(o: Onglet) {
    setOnglet(o);
    setPage(1);
    setData(null);
  }

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (data?.pageSize || 20)));
  const filtreActif = JSON.stringify(filtres) !== JSON.stringify(VIDE);

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconReceipt className="h-6 w-6 text-brass" />
          Facturation
        </h1>
        <p className="text-sm font-medium text-ink-muted">Factures, avoirs et retours</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Type de document">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            role="tab"
            aria-selected={onglet === o.id}
            onClick={() => changerOnglet(o.id)}
            className={`choice-pill !py-2 ${onglet === o.id ? "choice-pill-active" : ""}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <form
        className="mb-4 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          appliquer();
        }}
      >
        <div className="relative">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            className="field-input !pl-9"
            placeholder="Rechercher un client, un contact, un numéro de facture, un motif…"
            value={brouillon.q}
            onChange={(e) => setBrouillon({ ...brouillon, q: e.target.value })}
            aria-label="Recherche"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field-input" aria-label="Type de boutique" value={brouillon.typeId} onChange={(e) => setBrouillon({ ...brouillon, typeId: e.target.value })}>
            <option value="">Type de boutique</option>
            {ref?.types?.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </select>
          <select className="field-input" aria-label="Commercial" value={brouillon.commercialId} onChange={(e) => setBrouillon({ ...brouillon, commercialId: e.target.value })}>
            <option value="">Tous les commerciaux</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
          </select>
          <select className="field-input" aria-label="Ville" value={brouillon.villeId} onChange={(e) => setBrouillon({ ...brouillon, villeId: e.target.value })}>
            <option value="">Toutes les villes</option>
            {ref?.villes?.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
          </select>
          <input type="date" className="field-input !w-40" aria-label="Du" value={brouillon.dateFrom} onChange={(e) => setBrouillon({ ...brouillon, dateFrom: e.target.value })} />
          <input type="date" className="field-input !w-40" aria-label="Au" value={brouillon.dateTo} onChange={(e) => setBrouillon({ ...brouillon, dateTo: e.target.value })} />
          <button type="submit" className="btn-primary">Filtrer</button>
          {(filtreActif || JSON.stringify(brouillon) !== JSON.stringify(VIDE)) && (
            <button type="button" className="btn-secondary" onClick={reinitialiser}>Réinitialiser</button>
          )}
        </div>
      </form>

      {info && (
        <p className="mb-3 rounded-lg border border-ok/40 bg-ok/10 px-4 py-2.5 text-sm font-bold text-ok" role="status">
          {info}
        </p>
      )}

      {data && (
        <p className="mb-3 text-sm font-medium text-ink-muted">
          <span className="montant font-bold text-ink">{nombreFr(total)}</span> document{total > 1 ? "s" : ""}
          {onglet === "FV" ? (
            <>
              {" "}· facturé <span className="montant font-bold text-ink">{nombreFr(data.totaux.facture)}</span> FCFA
              {data.totaux.avoirs > 0 && <> · avoirs et retours <span className="montant font-bold text-danger">{nombreFr(data.totaux.avoirs)}</span> FCFA</>}
            </>
          ) : (
            <> · total <span className="montant font-bold text-ink">{nombreFr(data.totaux.montant)}</span> FCFA</>
          )}
        </p>
      )}

      {erreur && (
        <p className="field-card mb-3 flex items-center justify-between gap-3 text-sm font-bold text-danger" role="alert">
          {erreur}
          <button className="btn-secondary" onClick={charger}><IconRefresh className="h-4 w-4" />Réessayer</button>
        </p>
      )}

      <div className="space-y-3">
        {onglet === "FV" &&
          (data?.items as ItemFV[] | undefined)?.map((c) => (
            <article key={c.id} className="field-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-extrabold text-ink">{c.pointVente.nomEtablissement}</p>
                  <p className="text-xs font-medium text-ink-muted">
                    {interlocuteur(c.pointVente)} · {c.pointVente.ville?.nom ?? "—"} · {dateFr(c.livreeLe ?? c.dateCommande)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-brass">
                    {c.numeroFV ?? "FV non numérotée"} · {libelleModePaiement(c.modePaiement)} · {c.commercial.prenom} {c.commercial.nom}
                  </p>
                </div>
                <div className="text-right">
                  <p className="montant text-xl font-extrabold text-ink">{nombreFr(c.net)} <span className="text-xs font-bold text-ink-muted">FCFA</span></p>
                  {c.avoirsTotal > 0 && (
                    <p className="text-xs font-medium text-ink-muted">
                      Facturé <span className="montant">{nombreFr(c.montantTotal)}</span> · crédité <span className="montant text-danger">{nombreFr(c.avoirsTotal)}</span>
                    </p>
                  )}
                  {c.reste > 0 && (
                    <p className="text-xs font-bold text-danger">Reste à encaisser <span className="montant">{nombreFr(c.reste)}</span> FCFA</p>
                  )}
                </div>
              </div>

              {c.documentsCorrectifs.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                  {c.documentsCorrectifs.map((d) => (
                    <span key={d.id} className="rounded-full border border-line bg-bg-elevated px-2.5 py-0.5 text-ink-muted">
                      {d.numero} · <span className="montant">{nombreFr(d.montant)}</span>
                    </span>
                  ))}
                </p>
              )}

              <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                <button className="btn-secondary" onClick={() => telechargerFactureVente(c)}>
                  <IconDownload className="h-4 w-4" />
                  Facture
                </button>
                {ecriture && (
                  <button className="btn-secondary" disabled={c.net <= 0} onClick={() => { setInfo(null); setCible(c); }}>
                    <IconRefresh className="h-4 w-4" />
                    Avoir / Retour
                  </button>
                )}
              </div>
            </article>
          ))}

        {onglet !== "FV" &&
          (data?.items as ItemDoc[] | undefined)?.map((d) => (
            <article key={d.id} className="field-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-extrabold text-ink">{d.commande.pointVente.nomEtablissement}</p>
                  <p className="text-xs font-medium text-ink-muted">
                    {interlocuteur(d.commande.pointVente)} · {d.commande.pointVente.ville?.nom ?? "—"} · {dateFr(d.createdAt)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-brass">
                    {d.numero} · sur {d.commande.numeroFV ?? "facture"}
                    {d.type === "FR" && d.destination ? ` · ${d.destination === "AVARIES" ? "Avaries" : "Stock vendable"}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-ink-muted">Motif : {d.motif}</p>
                </div>
                <div className="text-right">
                  <p className="montant text-xl font-extrabold text-danger">- {nombreFr(d.montant)} <span className="text-xs font-bold text-ink-muted">FCFA</span></p>
                  {d.remboursement > 0 && (
                    <p className="text-xs font-medium text-ink-muted">Remboursé <span className="montant font-bold">{nombreFr(d.remboursement)}</span> FCFA</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button className="btn-secondary" onClick={() => telechargerDocumentCorrectif(d)}>
                  <IconDownload className="h-4 w-4" />
                  {d.type === "FR" ? "Facture retour" : "Facture d'avoir"}
                </button>
              </div>
            </article>
          ))}

        {chargement && !data && <ChargementPage compact label="Chargement…" />}
        {chargement && data && <div className="flex justify-center py-2"><Spinner /></div>}
        {!chargement && data && data.items.length === 0 && (
          <p className="field-card text-center text-sm font-medium text-ink-muted">
            {filtreActif ? "Aucun document ne correspond à ces filtres." : onglet === "FV" ? "Aucune facture : elles sont émises à la livraison des commandes." : "Aucun document émis pour le moment."}
          </p>
        )}
      </div>

      {total > (data?.pageSize || 20) && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</button>
          <span className="text-sm font-medium text-ink-muted">Page <span className="montant">{page}</span> / <span className="montant">{pages}</span></span>
          <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant</button>
        </div>
      )}

      {cible && (
        <ModaleAvoirRetour
          facture={cible}
          onFermer={() => setCible(null)}
          onEmis={(r) => {
            setCible(null);
            setInfo(`${r.numero} émise — ${nombreFr(r.montant)} FCFA${r.remboursement > 0 ? `, dont ${nombreFr(r.remboursement)} FCFA remboursés` : ""}.`);
            charger();
          }}
        />
      )}
    </div>
  );
}
