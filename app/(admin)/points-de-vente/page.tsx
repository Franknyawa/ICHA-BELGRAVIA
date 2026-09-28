"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconStorefront, IconArrowRight } from "@/components/icons";

type PointVente = {
  id: string;
  nomEtablissement: string;
  nomVendeur: string | null;
  telVendeur: string | null;
  telPatron: string | null;
  quartier: string | null;
  statut: string;
  createdAt: string;
  ville: { nom: string } | null;
  type: { nom: string } | null;
  createdBy: { nom: string; prenom: string };
  _count: { visites: number; commandes: number };
};

type Referentiels = { villes: { id: string; nom: string }[]; types: { id: string; nom: string }[] };

const STATUT_STYLE: Record<string, string> = {
  OUVERT: "text-ok",
  FERME_TEMPORAIREMENT: "text-warn",
  EN_TRAVAUX: "text-ink-muted",
};
const STATUT_LABEL: Record<string, string> = {
  OUVERT: "Ouvert",
  FERME_TEMPORAIREMENT: "Fermé temp.",
  EN_TRAVAUX: "En travaux",
};

const FILTRES_VIDES = { villeId: "", typeId: "", q: "" };

export default function PointsDeVentePage() {
  const [items, setItems] = useState<PointVente[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [ref, setRef] = useState<Referentiels | null>(null);
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [chargement, setChargement] = useState(true);

  function params(p: number) {
    const s = new URLSearchParams({ page: String(p) });
    if (filtres.villeId) s.set("villeId", filtres.villeId);
    if (filtres.typeId) s.set("typeId", filtres.typeId);
    if (filtres.q) s.set("q", filtres.q);
    return s;
  }

  async function charger(p = page) {
    setChargement(true);
    const res = await fetch(`/api/points-vente?${params(p).toString()}`);
    const data = await res.json();
    setItems(data.items || []);
    setTotal(data.total || 0);
    setChargement(false);
  }

  useEffect(() => {
    fetch("/api/referentiels").then((r) => r.json()).then(setRef);
  }, []);

  useEffect(() => {
    setPage(1);
    charger(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtres]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconStorefront className="h-5 w-5 text-brass" />
          Points de vente
        </h1>
        <p className="text-sm text-ink-muted">
          {total} point(s) de vente — fiche complète (coordonnées, historique de visites et de
          commandes) pour chacun.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          className="field-input max-w-[240px]"
          placeholder="Rechercher établissement, vendeur, tél…"
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
              <th className="px-4 py-3 font-medium">Contacts</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Visites</th>
              <th className="px-4 py-3 font-medium">Commandes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-line hover:bg-bg-card">
                <td className="px-4 py-3">
                  <Link href={`/points-de-vente/${p.id}`} className="font-medium text-ink hover:text-brass">
                    {p.nomEtablissement}
                  </Link>
                  <p className="text-xs text-ink-muted">{p.nomVendeur || "—"}</p>
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {p.ville?.nom || "—"}{p.quartier ? ` · ${p.quartier}` : ""}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {p.telVendeur && <div>Vendeur : {p.telVendeur}</div>}
                  {p.telPatron && <div>Patron : {p.telPatron}</div>}
                  {!p.telVendeur && !p.telPatron && "—"}
                </td>
                <td className="px-4 py-3 text-ink-muted">{p.type?.nom || "—"}</td>
                <td className={`px-4 py-3 font-medium ${STATUT_STYLE[p.statut] || "text-ink-muted"}`}>
                  {STATUT_LABEL[p.statut] || p.statut}
                </td>
                <td className="px-4 py-3 text-ink-muted">{p._count.visites}</td>
                <td className="px-4 py-3 text-ink-muted">{p._count.commandes}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/points-de-vente/${p.id}`} className="inline-flex rounded-md p-1.5 text-ink-muted hover:text-brass">
                    <IconArrowRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
            {!chargement && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink-muted">
                  Aucun point de vente ne correspond à ces filtres.
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
