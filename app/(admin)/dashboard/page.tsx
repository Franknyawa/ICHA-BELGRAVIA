"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconDownload, IconStorefront, IconPin } from "@/components/icons";

type Visite = {
  id: string;
  createdAt: string;
  dateVisite: string;
  potentielEstime: string | null;
  veutCommander: boolean | null;
  pointVente: {
    nomEtablissement: string;
    telVendeur: string | null;
    quartier: string | null;
    statut: string;
    latitude: string | null;
    longitude: string | null;
    ville: { nom: string } | null;
    type: { nom: string } | null;
  };
};

type Referentiels = {
  villes: { id: string; nom: string }[];
  types: { id: string; nom: string }[];
};
type Agent = { id: string; nom: string; prenom: string };

const POTENTIEL_STYLE: Record<string, string> = {
  FORT: "text-ok",
  MOYEN: "text-warn",
  FAIBLE: "text-ink-muted",
};

const FILTRES_VIDES = { villeId: "", typeId: "", potentiel: "", commercialId: "", q: "", dateFrom: "", dateTo: "" };

export default function Dashboard() {
  const [visites, setVisites] = useState<Visite[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [nouveaux, setNouveaux] = useState(0);
  const [ref, setRef] = useState<Referentiels | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [chargement, setChargement] = useState(true);

  function paramsActuels(p: number) {
    const params = new URLSearchParams({ page: String(p) });
    if (filtres.villeId) params.set("villeId", filtres.villeId);
    if (filtres.typeId) params.set("typeId", filtres.typeId);
    if (filtres.potentiel) params.set("potentiel", filtres.potentiel);
    if (filtres.commercialId) params.set("commercialId", filtres.commercialId);
    if (filtres.q) params.set("q", filtres.q);
    if (filtres.dateFrom) params.set("dateFrom", filtres.dateFrom);
    if (filtres.dateTo) params.set("dateTo", filtres.dateTo);
    return params;
  }

  async function charger(p = page) {
    setChargement(true);
    const res = await fetch(`/api/visites?${paramsActuels(p).toString()}`);
    const data = await res.json();
    setVisites(data.items);
    setTotal(data.total);
    setChargement(false);
  }

  useEffect(() => {
    fetch("/api/referentiels").then((r) => r.json()).then(setRef);
    fetch("/api/utilisateurs?role=COMMERCIAL").then((r) => r.json()).then((d) => setAgents(d.users || []));
  }, []);

  useEffect(() => {
    setPage(1);
    charger(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtres]);

  useEffect(() => {
    const source = new EventSource("/api/visites/stream");
    source.addEventListener("nouvelle-visite", () => setNouveaux((n) => n + 1));
    return () => source.close();
  }, []);

  function rafraichir() {
    setNouveaux(0);
    charger(1);
    setPage(1);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
            <IconStorefront className="h-5 w-5 text-brass" />
            Visites terrain
          </h1>
          <p className="text-sm text-ink-muted">{total} point(s) de vente recensé(s)</p>
        </div>
        {nouveaux > 0 && (
          <button onClick={rafraichir} className="btn-primary">
            {nouveaux} nouvelle{nouveaux > 1 ? "s" : ""} visite{nouveaux > 1 ? "s" : ""} — actualiser
          </button>
        )}
        <a href={`/api/visites/export?${paramsActuels(1).toString()}`} className="btn-secondary">
          <IconDownload className="h-4 w-4" />
          Exporter en CSV (filtres actifs)
        </a>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          className="field-input max-w-[220px]"
          placeholder="Rechercher un établissement…"
          value={filtres.q}
          onChange={(e) => setFiltres({ ...filtres, q: e.target.value })}
        />
        <select className="field-input max-w-[170px]" value={filtres.villeId} onChange={(e) => setFiltres({ ...filtres, villeId: e.target.value })}>
          <option value="">Toutes les villes</option>
          {ref?.villes.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
        </select>
        <select className="field-input max-w-[190px]" value={filtres.typeId} onChange={(e) => setFiltres({ ...filtres, typeId: e.target.value })}>
          <option value="">Tous les types</option>
          {ref?.types.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
        </select>
        <select className="field-input max-w-[150px]" value={filtres.potentiel} onChange={(e) => setFiltres({ ...filtres, potentiel: e.target.value })}>
          <option value="">Tout potentiel</option>
          <option value="FORT">Fort</option>
          <option value="MOYEN">Moyen</option>
          <option value="FAIBLE">Faible</option>
        </select>
        <select className="field-input max-w-[190px]" value={filtres.commercialId} onChange={(e) => setFiltres({ ...filtres, commercialId: e.target.value })}>
          <option value="">Tous les agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
        </select>
        <input type="date" className="field-input max-w-[150px]" value={filtres.dateFrom} onChange={(e) => setFiltres({ ...filtres, dateFrom: e.target.value })} />
        <input type="date" className="field-input max-w-[150px]" value={filtres.dateTo} onChange={(e) => setFiltres({ ...filtres, dateTo: e.target.value })} />
        {JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES) && (
          <button className="btn-secondary" onClick={() => setFiltres(FILTRES_VIDES)}>Réinitialiser</button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-left text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Établissement</th>
              <th className="px-4 py-3 font-medium">Ville / Quartier</th>
              <th className="px-4 py-3 font-medium">Tél. vendeur</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Potentiel</th>
              <th className="px-4 py-3 font-medium">Commande ?</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visites.map((v) => (
              <tr key={v.id} className="border-t border-line hover:bg-bg-card">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/${v.id}`} className="font-medium text-ink hover:text-brass">
                    {v.pointVente.nomEtablissement}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {v.pointVente.ville?.nom || "—"}{v.pointVente.quartier ? ` · ${v.pointVente.quartier}` : ""}
                </td>
                <td className="px-4 py-3 text-ink-muted">{v.pointVente.telVendeur || "—"}</td>
                <td className="px-4 py-3 text-ink-muted">{v.pointVente.type?.nom || "—"}</td>
                <td className="px-4 py-3 text-ink-muted">{v.pointVente.statut}</td>
                <td className={`px-4 py-3 font-medium ${v.potentielEstime ? POTENTIEL_STYLE[v.potentielEstime] : "text-ink-muted"}`}>
                  {v.potentielEstime || "—"}
                </td>
                <td className="px-4 py-3 text-ink-muted">{v.veutCommander === null ? "—" : v.veutCommander ? "Oui" : "Non"}</td>
                <td className="px-4 py-3 text-ink-muted">
                  {new Date(v.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-3 text-right">
                  {v.pointVente.latitude && v.pointVente.longitude && (
                    <a
                      href={`https://www.google.com/maps?q=${v.pointVente.latitude},${v.pointVente.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Voir sur la carte"
                      className="inline-flex rounded-md p-1.5 text-ink-muted hover:text-brass"
                    >
                      <IconPin className="h-4 w-4" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {!chargement && visites.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-ink-muted">
                  Aucune visite ne correspond à ces filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); charger(p); }}>
            Précédent
          </button>
          <span className="flex items-center px-2 text-sm text-ink-muted">Page {page}</span>
          <button className="btn-secondary" disabled={page * 20 >= total} onClick={() => { const p = page + 1; setPage(p); charger(p); }}>
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
