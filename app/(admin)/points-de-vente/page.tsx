"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconStorefront, IconArrowRight, IconCheckCircle, IconAlert, IconGear, IconDownload, IconPrinter } from "@/components/icons";
import { exporterRapportPdf } from "@/lib/rapportPdf";
import { NOM_APP } from "@/lib/marque";
import { libelleTypes } from "@/lib/typesEtablissement";
import { Spinner, ChargementPage } from "@/components/Spinner";

type PointVente = {
  id: string;
  nomEtablissement: string;
  nomVendeur: string | null;
  telVendeur: string | null;
  nomPatron?: string | null;
  telPatron: string | null;
  quartier: string | null;
  createdAt: string;
  ville: { nom: string } | null;
  type: { nom: string } | null;
  typesLies?: { type: { nom: string } }[];
  typeAutrePrecision?: string | null;
  createdBy: { nom: string; prenom: string };
  _count: { visites: number; commandes: number };
};

type Referentiels = { villes: { id: string; nom: string }[]; types: { id: string; nom: string }[] };

const FILTRES_VIDES = { villeId: "", typeId: "", quartier: "", q: "" };

export default function PointsDeVentePage() {
  const [items, setItems] = useState<PointVente[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [ref, setRef] = useState<Referentiels | null>(null);
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [chargement, setChargement] = useState(true);
  const [exportEnCours, setExportEnCours] = useState(false);

  function params(p: number) {
    const s = new URLSearchParams({ page: String(p) });
    if (filtres.villeId) s.set("villeId", filtres.villeId);
    if (filtres.typeId) s.set("typeId", filtres.typeId);
    if (filtres.quartier) s.set("quartier", filtres.quartier);
    if (filtres.q) s.set("q", filtres.q);
    return s;
  }

  function resumeFiltres(): string {
    const morceaux: string[] = [];
    if (filtres.villeId) morceaux.push(`Ville : ${ref?.villes.find((v) => v.id === filtres.villeId)?.nom || filtres.villeId}`);
    if (filtres.quartier) morceaux.push(`Quartier : ${filtres.quartier}`);
    if (filtres.typeId) morceaux.push(`Type : ${ref?.types.find((t) => t.id === filtres.typeId)?.nom || filtres.typeId}`);
    if (filtres.q) morceaux.push(`Recherche : "${filtres.q}"`);
    return morceaux.length ? morceaux.join(" · ") : "Tous les points de vente";
  }

  async function exporterPdf() {
    setExportEnCours(true);
    try {
      const s = params(1);
      s.set("toutesLesLignes", "1");
      const res = await fetch(`/api/points-vente?${s.toString()}`);
      const data = await res.json();
      const lignes = (data.items as PointVente[]).map((p) => ({
        etablissement: p.nomEtablissement,
        ville: p.ville?.nom || "—",
        quartier: p.quartier || "—",
        contacts: [p.telVendeur, p.telPatron].filter(Boolean).join(" / ") || "—",
        type: libelleTypes(p),
        visites: p._count.visites,
        commandes: p._count.commandes,
      }));
      await exporterRapportPdf({
        titre: "Points de vente",
        sousTitre: resumeFiltres(),
        colonnes: [
          { cle: "etablissement", label: "Établissement" },
          { cle: "ville", label: "Ville" },
          { cle: "quartier", label: "Quartier" },
          { cle: "contacts", label: "Contacts" },
          { cle: "type", label: "Type" },
          { cle: "visites", label: "Visites", droite: true },
          { cle: "commandes", label: "Commandes", droite: true },
        ],
        lignes,
        totaux: {
          visites: lignes.reduce((s, l) => s + l.visites, 0),
          commandes: lignes.reduce((s, l) => s + l.commandes, 0),
        },
      });
    } finally {
      setExportEnCours(false);
    }
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
    // Anti-rafale : évite une requête DB à chaque lettre tapée dans
    // "Rechercher…" ou "Quartier".
    const t = setTimeout(() => {
      setPage(1);
      charger(1);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtres]);

  const debutPage = total === 0 ? 0 : (page - 1) * 20 + 1;
  const finPage = Math.min(page * 20, total);
  const avecCommandes = items.filter((p) => p._count.commandes > 0).length;
  const sansCommande = items.length - avecCommandes;
  const filtresActifs = JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES);

  return (
    <div>
      <div className="mb-5 hidden print:block">
        <h1 className="font-display text-2xl text-ink">{NOM_APP} — Points de vente</h1>
        <p className="text-sm text-ink-muted">{resumeFiltres()}</p>
        <p className="text-xs text-ink-muted">Généré le {new Date().toLocaleDateString("fr-FR")}</p>
      </div>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 no-print">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
            <IconStorefront className="h-5 w-5 text-brass" />
            Points de vente
          </h1>
          <p className="text-sm text-ink-muted">
            Fiche complète (coordonnées, historique de visites et de commandes) pour chaque point de vente.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={exportEnCours} onClick={exporterPdf}>
            <IconDownload className="h-4 w-4" />
            {exportEnCours && <Spinner className="h-4 w-4" />}
            {exportEnCours ? "Export…" : "Télécharger PDF"}
          </button>
          <button className="btn-secondary" onClick={() => window.print()}>
            <IconPrinter className="h-4 w-4" />
            Imprimer
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3 no-print">
        <div className="field-card flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
            <IconStorefront className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">{total}</p>
            <p className="text-xs text-ink-muted">Recensés au total</p>
          </div>
        </div>
        <div className="field-card flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ok/10 text-ok">
            <IconCheckCircle className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">{avecCommandes}</p>
            <p className="text-xs text-ink-muted">Déjà clients (page courante)</p>
          </div>
        </div>
        <div className="field-card flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warn/10 text-warn">
            <IconAlert className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">{sansCommande}</p>
            <p className="text-xs text-ink-muted">Sans commande (page courante)</p>
          </div>
        </div>
      </div>

      <div className="field-card mb-6 flex flex-wrap items-center gap-2 no-print">
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
        <input
          className="field-input max-w-[170px]"
          placeholder="Quartier…"
          value={filtres.quartier}
          onChange={(e) => setFiltres({ ...filtres, quartier: e.target.value })}
        />
        <select className="field-input max-w-[190px]" value={filtres.typeId} onChange={(e) => setFiltres({ ...filtres, typeId: e.target.value })}>
          <option value="">Tous les types</option>
          {ref?.types.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
        </select>
        {filtresActifs && (
          <button className="btn-secondary" onClick={() => setFiltres(FILTRES_VIDES)}>Réinitialiser</button>
        )}
        {filtresActifs && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-brass">
            <IconGear className="h-3.5 w-3.5" />
            Filtres actifs
          </span>
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
              <th className="px-4 py-3 font-medium">Visites</th>
              <th className="px-4 py-3 font-medium">Commandes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {chargement && (
              <tr>
                <td colSpan={7}>
                  <ChargementPage compact label="Chargement des points de vente…" />
                </td>
              </tr>
            )}
            {!chargement &&
              items.map((p) => (
                <tr key={p.id} className="border-t border-line transition-colors hover:bg-bg-elevated">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
                        <IconStorefront className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <Link href={`/points-de-vente/${p.id}`} className="font-medium text-ink hover:text-brass">
                          {p.nomEtablissement}
                        </Link>
                        <p className="text-xs text-ink-muted">{p.nomVendeur || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {p.ville?.nom || "—"}{p.quartier ? ` · ${p.quartier}` : ""}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {p.telVendeur && <div>Contact : {p.telVendeur}</div>}
                    {(p.nomPatron || p.telPatron) && <div>Patron : {[p.nomPatron, p.telPatron].filter(Boolean).join(" — ")}</div>}
                    {!p.telVendeur && !p.telPatron && !p.nomPatron && "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{libelleTypes(p)}</td>
                  <td className="px-4 py-3 text-ink-muted">{p._count.visites}</td>
                  <td className="px-4 py-3 text-ink-muted">{p._count.commandes}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/points-de-vente/${p.id}`} className="inline-flex rounded-md p-1.5 text-ink-muted hover:bg-brass/10 hover:text-brass">
                      <IconArrowRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            {!chargement && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                  Aucun point de vente ne correspond à ces filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-sm text-ink-muted">
            {debutPage}–{finPage} sur {total}
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); charger(p); }}>
              Précédent
            </button>
            <button className="btn-secondary" disabled={page * 20 >= total} onClick={() => { const p = page + 1; setPage(p); charger(p); }}>
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
