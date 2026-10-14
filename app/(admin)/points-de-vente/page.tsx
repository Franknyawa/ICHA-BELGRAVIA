"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconStorefront, IconArrowRight, IconCheckCircle, IconAlert, IconGear, IconDownload, IconPrinter, IconCalendar, IconList } from "@/components/icons";
import { exporterRapportPdf } from "@/lib/rapportPdf";
import { NOM_APP } from "@/lib/marque";
import { libelleTypes, nomsTypes } from "@/lib/typesEtablissement";
import { telechargerCsv } from "@/lib/csv";
import { Spinner, ChargementPage } from "@/components/Spinner";
import { aujourdhuiISO, ajouterJours } from "@/lib/dates";

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
  visites?: { potentielEstime: string | null }[];
};

type Referentiels = { villes: { id: string; nom: string }[]; types: { id: string; nom: string }[] };

const FILTRES_VIDES = { villeId: "", typeId: "", quartier: "", q: "", du: "", au: "", base: "recensement", potentiel: "", client: "" };

type Groupe = "" | "ville" | "quartier" | "type" | "agent" | "potentiel" | "jour";
type Tri = "recent" | "ancien" | "nom" | "visites" | "commandes";

const GROUPES: { value: Groupe; label: string }[] = [
  { value: "", label: "Aucun regroupement" },
  { value: "quartier", label: "Par quartier" },
  { value: "ville", label: "Par ville" },
  { value: "type", label: "Par type d'établissement" },
  { value: "potentiel", label: "Par potentiel" },
  { value: "agent", label: "Par agent (recenseur)" },
  { value: "jour", label: "Par jour de recensement" },
];
const TRIS: { value: Tri; label: string }[] = [
  { value: "recent", label: "Plus récents d'abord" },
  { value: "ancien", label: "Plus anciens d'abord" },
  { value: "nom", label: "Nom (A → Z)" },
  { value: "visites", label: "Plus de visites" },
  { value: "commandes", label: "Plus de commandes" },
];
const LIBELLE_POTENTIEL: Record<string, string> = { FORT: "Fort", MOYEN: "Moyen", FAIBLE: "Faible" };

function potentielDe(p: PointVente): string {
  const v = p.visites?.[0]?.potentielEstime;
  return v ? LIBELLE_POTENTIEL[v] || v : "Non évalué";
}

/** Libellés des groupes auxquels appartient un point (un point à plusieurs types figure dans chacun). */
function clesDeGroupe(p: PointVente, g: Groupe): string[] {
  switch (g) {
    case "ville": return [p.ville?.nom || "Ville non renseignée"];
    case "quartier": return [`${p.ville?.nom || "Ville non renseignée"} — ${p.quartier?.trim() || "Quartier non précisé"}`];
    case "type": { const t = nomsTypes(p); return t.length ? t : ["Type non renseigné"]; }
    case "potentiel": return [`Potentiel : ${potentielDe(p)}`];
    case "agent": return [`${p.createdBy.prenom} ${p.createdBy.nom}`];
    case "jour": return [`Recensés le ${new Date(p.createdAt).toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" })}`];
    default: return [""];
  }
}

function trier(items: PointVente[], tri: Tri): PointVente[] {
  const a = [...items];
  const date = (p: PointVente) => new Date(p.createdAt).getTime();
  switch (tri) {
    case "ancien": return a.sort((x, y) => date(x) - date(y));
    case "nom": return a.sort((x, y) => x.nomEtablissement.localeCompare(y.nomEtablissement, "fr"));
    case "visites": return a.sort((x, y) => y._count.visites - x._count.visites || date(y) - date(x));
    case "commandes": return a.sort((x, y) => y._count.commandes - x._count.commandes || date(y) - date(x));
    default: return a.sort((x, y) => date(y) - date(x));
  }
}

function formaterJour(iso: string) {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

export default function PointsDeVentePage() {
  const [items, setItems] = useState<PointVente[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [ref, setRef] = useState<Referentiels | null>(null);
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [groupe, setGroupe] = useState<Groupe>("");
  const [tri, setTri] = useState<Tri>("recent");
  const [ordreGroupes, setOrdreGroupes] = useState<"effectif" | "alpha">("effectif");
  const [chargement, setChargement] = useState(true);
  const [exportEnCours, setExportEnCours] = useState<"pdf" | "csv" | null>(null);
  const vueGroupee = groupe !== "";
  // Un tri autre que « récents » doit porter sur tous les points, pas sur une seule page.
  const toutCharger = vueGroupee || tri !== "recent";

  function params(p: number) {
    const s = new URLSearchParams({ page: String(p) });
    if (filtres.villeId) s.set("villeId", filtres.villeId);
    if (filtres.typeId) s.set("typeId", filtres.typeId);
    if (filtres.quartier) s.set("quartier", filtres.quartier);
    if (filtres.q) s.set("q", filtres.q);
    if (filtres.potentiel) s.set("potentiel", filtres.potentiel);
    if (filtres.client) s.set("client", filtres.client);
    if (filtres.du) s.set("du", filtres.du);
    if (filtres.au) s.set("au", filtres.au);
    if ((filtres.du || filtres.au) && filtres.base === "visite") s.set("base", "visite");
    return s;
  }

  function resumeFiltres(): string {
    const morceaux: string[] = [];
    if (filtres.villeId) morceaux.push(`Ville : ${ref?.villes.find((v) => v.id === filtres.villeId)?.nom || filtres.villeId}`);
    if (filtres.quartier) morceaux.push(`Quartier : ${filtres.quartier}`);
    if (filtres.typeId) morceaux.push(`Type : ${ref?.types.find((t) => t.id === filtres.typeId)?.nom || filtres.typeId}`);
    if (filtres.potentiel) morceaux.push(`Potentiel : ${LIBELLE_POTENTIEL[filtres.potentiel]}`);
    if (filtres.client) morceaux.push(filtres.client === "oui" ? "Déjà clients" : "Prospects sans commande");
    if (filtres.q) morceaux.push(`Recherche : "${filtres.q}"`);
    if (filtres.du || filtres.au) {
      const quand =
        filtres.du && filtres.du === filtres.au
          ? `le ${formaterJour(filtres.du)}`
          : `${filtres.du ? `du ${formaterJour(filtres.du)}` : ""} ${filtres.au ? `au ${formaterJour(filtres.au)}` : ""}`.trim();
      morceaux.push(`${filtres.base === "visite" ? "Visités" : "Recensés"} ${quand}`);
    }
    if (groupe) morceaux.push(`${GROUPES.find((g) => g.value === groupe)?.label} · ${TRIS.find((t) => t.value === tri)?.label.toLowerCase()}`);
    return morceaux.length ? morceaux.join(" · ") : "Tous les points de vente";
  }

  /** Tous les points correspondant aux filtres (exports et vue groupée). */
  async function chargerTous(): Promise<PointVente[]> {
    const s = params(1);
    s.set("toutesLesLignes", "1");
    const res = await fetch(`/api/points-vente?${s.toString()}`);
    const data = await res.json();
    return (data.items as PointVente[]) || [];
  }

  /** Lignes d'export (PDF/CSV) : groupées si un regroupement est choisi. */
  function construireGroupes(source: PointVente[]) {
    const triees = trier(source, tri);
    if (!vueGroupee) return [{ cle: "", points: triees }];
    const map = new Map<string, PointVente[]>();
    for (const p of triees) for (const k of clesDeGroupe(p, groupe)) map.set(k, [...(map.get(k) || []), p]);
    const liste = [...map.entries()].map(([cle, points]) => ({ cle, points }));
    if (groupe === "jour") return liste; // déjà dans l'ordre du tri choisi
    return liste.sort((a, b) =>
      ordreGroupes === "effectif" ? b.points.length - a.points.length || a.cle.localeCompare(b.cle, "fr") : a.cle.localeCompare(b.cle, "fr")
    );
  }

  const groupes = useMemo(
    () => construireGroupes(items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, groupe, tri, ordreGroupes]
  );

  const ligneDe = (p: PointVente) => ({
    etablissement: p.nomEtablissement,
    ville: p.ville?.nom || "—",
    quartier: p.quartier || "—",
    client: [p.nomPatron, p.nomVendeur].filter(Boolean).join(" / ") || "—",
    contacts: [p.telVendeur, p.telPatron].filter(Boolean).join(" / ") || "—",
    type: libelleTypes(p),
    potentiel: potentielDe(p),
    visites: p._count.visites,
    commandes: p._count.commandes,
    recense: new Date(p.createdAt).toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" }),
    agent: `${p.createdBy.prenom} ${p.createdBy.nom}`,
  });

  async function exporterPdf() {
    setExportEnCours("pdf");
    try {
      const source = toutCharger ? items : await chargerTous();
      const gs = construireGroupes(source);
      const lignes: Record<string, string | number>[] = [];
      for (const g of gs) {
        if (vueGroupee) {
          const v = g.points.reduce((s, p) => s + p._count.visites, 0);
          const c = g.points.reduce((s, p) => s + p._count.commandes, 0);
          lignes.push({ __groupe: `${g.cle} — ${g.points.length} point${g.points.length > 1 ? "s" : ""} · ${v} visite${v > 1 ? "s" : ""} · ${c} commande${c > 1 ? "s" : ""}` });
        }
        for (const p of g.points) lignes.push(ligneDe(p));
      }
      await exporterRapportPdf({
        titre: vueGroupee ? "Points recenses par groupe" : "Points de vente",
        sousTitre: resumeFiltres(),
        colonnes: [
          { cle: "etablissement", label: "Établissement" },
          { cle: "ville", label: "Ville" },
          { cle: "quartier", label: "Quartier" },
          { cle: "client", label: "Client" },
          { cle: "contacts", label: "Contacts" },
          { cle: "type", label: "Type" },
          { cle: "potentiel", label: "Potentiel" },
          { cle: "visites", label: "Visites", droite: true },
          { cle: "commandes", label: "Cmd.", droite: true },
        ],
        lignes,
        totaux: {
          visites: source.reduce((s, p) => s + p._count.visites, 0),
          commandes: source.reduce((s, p) => s + p._count.commandes, 0),
        },
      });
    } finally {
      setExportEnCours(null);
    }
  }

  async function exporterCsv() {
    setExportEnCours("csv");
    try {
      const source = toutCharger ? items : await chargerTous();
      const gs = construireGroupes(source);
      const lignes: (string | number)[][] = [];
      for (const g of gs)
        for (const p of g.points) {
          const l = ligneDe(p);
          lignes.push([g.cle, l.etablissement, l.ville, l.quartier, l.client, l.contacts, l.type, l.potentiel, l.visites, l.commandes, l.recense, l.agent]);
        }
      telechargerCsv(vueGroupee ? `points-recenses-${groupe}` : "points-de-vente", [
        "Groupe", "Établissement", "Ville", "Quartier", "Client", "Contacts", "Type", "Potentiel", "Visites", "Commandes", "Recensé le", "Agent",
      ], lignes);
    } finally {
      setExportEnCours(null);
    }
  }

  async function charger(p = page) {
    setChargement(true);
    try {
      if (toutCharger) {
        const tous = await chargerTous();
        setItems(tous);
        setTotal(tous.length);
      } else {
        const res = await fetch(`/api/points-vente?${params(p).toString()}`);
        const data = await res.json();
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
    } finally {
      setChargement(false);
    }
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
  }, [filtres, toutCharger]);

  const debutPage = total === 0 ? 0 : (page - 1) * 20 + 1;
  const finPage = Math.min(page * 20, total);
  const avecCommandes = items.filter((p) => p._count.commandes > 0).length;
  const sansCommande = items.length - avecCommandes;
  const aujourdhui = aujourdhuiISO();
  const raccourcis: { label: string; du: string; au: string }[] = [
    { label: "Aujourd'hui", du: aujourdhui, au: aujourdhui },
    { label: "Hier", du: ajouterJours(aujourdhui, -1), au: ajouterJours(aujourdhui, -1) },
    { label: "7 derniers jours", du: ajouterJours(aujourdhui, -6), au: aujourdhui },
    { label: "30 derniers jours", du: ajouterJours(aujourdhui, -29), au: aujourdhui },
  ];
  const filtresActifs = JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES);

  const LigneTableau = ({ p }: { p: PointVente }) => (
    <tr className="border-t border-line transition-colors hover:bg-bg-elevated">
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
      <td className="px-4 py-3 text-ink-muted">{potentielDe(p)}</td>
      <td className="px-4 py-3 text-ink-muted">{p._count.visites}</td>
      <td className="px-4 py-3 text-ink-muted">{p._count.commandes}</td>
      <td className="px-4 py-3 text-right no-print">
        <Link href={`/points-de-vente/${p.id}`} className="inline-flex rounded-md p-1.5 text-ink-muted hover:bg-brass/10 hover:text-brass">
          <IconArrowRight className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );

  const EnteteTableau = () => (
    <thead className="bg-bg-elevated text-left text-ink-muted">
      <tr>
        <th className="px-4 py-3 font-medium">Établissement</th>
        <th className="px-4 py-3 font-medium">Ville / Quartier</th>
        <th className="px-4 py-3 font-medium">Contacts</th>
        <th className="px-4 py-3 font-medium">Type</th>
        <th className="px-4 py-3 font-medium">Potentiel</th>
        <th className="px-4 py-3 font-medium">Visites</th>
        <th className="px-4 py-3 font-medium">Commandes</th>
        <th className="px-4 py-3 no-print" />
      </tr>
    </thead>
  );

  return (
    <div className="pb-16">
      <div className="mb-5 hidden print:block">
        <h1 className="font-display text-2xl text-ink">{NOM_APP} — {vueGroupee ? "Points recensés par groupe" : "Points de vente"}</h1>
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
            Liste des points recensés : filtrez, regroupez (quartier, type, ville…), classez, puis imprimez ou exportez.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={exportEnCours !== null || chargement} onClick={exporterPdf}>
            {exportEnCours === "pdf" ? <Spinner className="h-4 w-4" /> : <IconDownload className="h-4 w-4" />}
            PDF
          </button>
          <button className="btn-secondary" disabled={exportEnCours !== null || chargement} onClick={exporterCsv}>
            {exportEnCours === "csv" ? <Spinner className="h-4 w-4" /> : <IconDownload className="h-4 w-4" />}
            CSV
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
            <p className="text-xs text-ink-muted">{filtresActifs ? "Points trouvés" : "Recensés au total"}</p>
          </div>
        </div>
        <div className="field-card flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ok/10 text-ok">
            <IconCheckCircle className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">{avecCommandes}</p>
            <p className="text-xs text-ink-muted">Déjà clients{vueGroupee ? "" : " (page courante)"}</p>
          </div>
        </div>
        <div className="field-card flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warn/10 text-warn">
            <IconAlert className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">{sansCommande}</p>
            <p className="text-xs text-ink-muted">Sans commande{vueGroupee ? "" : " (page courante)"}</p>
          </div>
        </div>
      </div>

      <div className="field-card mb-4 flex flex-wrap items-center gap-2 no-print">
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
        <select className="field-input max-w-[170px]" value={filtres.potentiel} onChange={(e) => setFiltres({ ...filtres, potentiel: e.target.value })}>
          <option value="">Tout potentiel</option>
          <option value="FORT">Potentiel fort</option>
          <option value="MOYEN">Potentiel moyen</option>
          <option value="FAIBLE">Potentiel faible</option>
        </select>
        <select className="field-input max-w-[190px]" value={filtres.client} onChange={(e) => setFiltres({ ...filtres, client: e.target.value })}>
          <option value="">Clients et prospects</option>
          <option value="oui">Déjà clients</option>
          <option value="non">Prospects sans commande</option>
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

      <div className="field-card mb-4 flex flex-wrap items-center gap-2 no-print">
        <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brass">
          <IconCalendar className="h-4 w-4" />
          Jour
        </span>
        <select
          className="field-input max-w-[150px]"
          value={filtres.base}
          onChange={(e) => setFiltres({ ...filtres, base: e.target.value })}
          aria-label="Date prise en compte"
        >
          <option value="recensement">Recensés</option>
          <option value="visite">Visités</option>
        </select>
        {raccourcis.map((r) => {
          const actif = filtres.du === r.du && filtres.au === r.au;
          return (
            <button
              key={r.label}
              type="button"
              onClick={() => setFiltres(actif ? { ...filtres, du: "", au: "" } : { ...filtres, du: r.du, au: r.au })}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                actif ? "border-brass bg-brass text-white" : "border-line text-ink-muted hover:border-brass hover:text-brass"
              }`}
            >
              {r.label}
            </button>
          );
        })}
        <label className="ml-1 flex items-center gap-1.5 text-xs text-ink-muted">
          Du
          <input type="date" className="field-input w-[150px]" value={filtres.du} max={filtres.au || undefined} onChange={(e) => setFiltres({ ...filtres, du: e.target.value })} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          au
          <input type="date" className="field-input w-[150px]" value={filtres.au} min={filtres.du || undefined} onChange={(e) => setFiltres({ ...filtres, au: e.target.value })} />
        </label>
      </div>

      <div className="field-card mb-6 flex flex-wrap items-center gap-2 no-print">
        <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brass">
          <IconList className="h-4 w-4" />
          Classement
        </span>
        <select className="field-input max-w-[240px]" value={groupe} onChange={(e) => setGroupe(e.target.value as Groupe)} aria-label="Regrouper par">
          {GROUPES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <select className="field-input max-w-[210px]" value={tri} onChange={(e) => setTri(e.target.value as Tri)} aria-label="Trier par">
          {TRIS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {vueGroupee && groupe !== "jour" && (
          <select className="field-input max-w-[290px]" value={ordreGroupes} onChange={(e) => setOrdreGroupes(e.target.value as "effectif" | "alpha")} aria-label="Ordre des groupes">
            <option value="effectif">Groupes les plus fournis d'abord</option>
            <option value="alpha">Groupes par ordre alphabétique</option>
          </select>
        )}
        {vueGroupee && !chargement && (
          <span className="ml-auto text-xs text-ink-muted">
            {groupes.length} groupe{groupes.length > 1 ? "s" : ""} · {total} point{total > 1 ? "s" : ""}
            {groupe === "type" && " (un point à plusieurs types figure dans chacun)"}
          </span>
        )}
      </div>

      {vueGroupee ? (
        <div className="space-y-5">
          {chargement && <ChargementPage compact label="Chargement des points de vente…" />}
          {!chargement && groupes.length > 0 && (
            <div className="flex flex-wrap gap-2 no-print">
              {groupes.map((g) => (
                <a
                  key={g.cle}
                  href={`#g-${encodeURIComponent(g.cle)}`}
                  className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition hover:border-brass hover:text-brass"
                >
                  {g.cle} <strong className="ml-1 text-ink">{g.points.length}</strong>
                </a>
              ))}
            </div>
          )}
          {!chargement &&
            groupes.map((g) => {
              const v = g.points.reduce((s, p) => s + p._count.visites, 0);
              const c = g.points.reduce((s, p) => s + p._count.commandes, 0);
              return (
                <section key={g.cle} id={`g-${encodeURIComponent(g.cle)}`} className="break-inside-avoid-page scroll-mt-4">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-display text-lg text-ink">
                      {g.cle}
                      <span className="ml-2 rounded-full bg-brass/10 px-2.5 py-0.5 align-middle font-sans text-xs font-semibold text-brass">
                        {g.points.length} point{g.points.length > 1 ? "s" : ""}
                      </span>
                    </h2>
                    <p className="text-xs text-ink-muted">{v} visite{v > 1 ? "s" : ""} · {c} commande{c > 1 ? "s" : ""}</p>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-line">
                    <table className="w-full text-sm">
                      <EnteteTableau />
                      <tbody>
                        {g.points.map((p) => <LigneTableau key={p.id} p={p} />)}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          {!chargement && groupes.length === 0 && (
            <p className="rounded-lg border border-line px-4 py-10 text-center text-ink-muted">Aucun point de vente ne correspond à ces filtres.</p>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <EnteteTableau />
              <tbody>
                {chargement && (
                  <tr>
                    <td colSpan={8}>
                      <ChargementPage compact label="Chargement des points de vente…" />
                    </td>
                  </tr>
                )}
                {!chargement && trier(items, tri).map((p) => <LigneTableau key={p.id} p={p} />)}
                {!chargement && items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">
                      Aucun point de vente ne correspond à ces filtres.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!toutCharger && total > 20 && (
            <div className="mt-4 flex items-center justify-between gap-2 no-print">
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
          {!toutCharger && total > 20 && (
            <p className="mt-2 text-xs text-ink-muted no-print">
              L'impression ne reprend que la page affichée ; le PDF et le CSV contiennent tous les points filtrés.
            </p>
          )}
        </>
      )}
    </div>
  );
}
