"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { v4 as uuid } from "uuid";
import { IconReceipt, IconStorefront, IconClipboard, IconCheckCircle, IconPlus } from "@/components/icons";
import { calculerCommande, calculerPaiement, montantLigne, trouverPrixCarton, MODES_PAIEMENT, type ModePaiementValue, type PalierPrix } from "@/lib/pricing";
import QuantiteCartons from "@/components/QuantiteCartons";
import PrixNegocie, { champsPrix, PRIX_VIDE, type EtatPrix } from "@/components/PrixNegocie";
import EchantillonsSection from "@/components/EchantillonsSection";
import GammeTabs from "@/components/GammeTabs";
import { Spinner } from "@/components/Spinner";
import { arrondirDemi } from "@/lib/quantites";
import { ID_CLIENT_DIVERS } from "@/lib/clientDivers";
import { libelleGamme, type GammeInfo } from "@/lib/gammesClient";
import { nombreFr } from "@/lib/format";

type Produit = { id: string; nom: string; volumeMl: number; gammeId: string | null; actif?: boolean };
type Palier = PalierPrix & { gammeId: string | null };
type Ref = { id: string; nom: string };
type PV = { id: string; nomEtablissement: string; nomVendeur: string | null; telVendeur: string | null; quartier: string | null; ville: string | null };
type Onglet = "EXISTANT" | "NOUVEAU" | "DIVERS";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export default function NouvelleCommandeBureau() {
  const [uuidCommande] = useState(() => uuid());
  const [role, setRole] = useState<string | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [paliersTous, setPaliersTous] = useState<Palier[]>([]);
  const [gammes, setGammes] = useState<GammeInfo[]>([]);
  const [villes, setVilles] = useState<Ref[]>([]);
  const [types, setTypes] = useState<Ref[]>([]);
  const [commerciaux, setCommerciaux] = useState<{ id: string; nom: string; prenom: string; actif: boolean }[]>([]);
  const [gammeId, setGammeId] = useState("");

  const [onglet, setOnglet] = useState<Onglet>("EXISTANT");
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<PV[]>([]);
  const [client, setClient] = useState<PV | null>(null);
  const [nv, setNv] = useState({ nomEtablissement: "", nomVendeur: "", telVendeur: "", villeId: "", quartier: "", repereQuartier: "", typeId: "" });

  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [echantillons, setEchantillons] = useState<Record<string, number>>({});
  const [etatPrix, setEtatPrix] = useState<EtatPrix>(PRIX_VIDE);
  const [prixMemo, setPrixMemo] = useState<Record<string, number>>({});

  const [modePaiement, setModePaiement] = useState<ModePaiementValue>("ESPECES");
  const [montantRecuSaisi, setMontantRecuSaisi] = useState(0);
  const [mobileMoneyConfirme, setMobileMoneyConfirme] = useState(true);
  const [operateurMobile, setOperateurMobile] = useState<"" | "ORANGE_MONEY" | "MTN_MOMO">("");

  const [commercialId, setCommercialId] = useState("");
  const [dateCommande, setDateCommande] = useState(aujourdhui());
  const [dateLivraison, setDateLivraison] = useState("");
  const [observations, setObservations] = useState("");

  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<{ numero: string; detail: string } | null>(null);

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((m) => setRole(m?.role ?? null)).catch(() => {});
    fetch("/api/referentiels").then((r) => r.json()).then((d) => {
      setProduits(d.produits || []);
      setGammes(d.gammes || []);
      setGammeId((p) => p || d.gammes?.[0]?.id || "");
      setVilles(d.villes || []);
      setTypes(d.types || []);
      setPaliersTous((d.paliersPrix || []).map((p: any) => ({ gammeId: p.gammeId ?? null, cartonsMin: p.cartonsMin, cartonsMax: p.cartonsMax, prixCarton: Number(p.prixCarton) })));
    });
    fetch("/api/utilisateurs?role=COMMERCIAL").then((r) => (r.ok ? r.json() : { users: [] })).then((d) => setCommerciaux((d.users || []).filter((u: any) => u.actif)));
  }, []);

  useEffect(() => {
    if (onglet !== "EXISTANT" || recherche.trim().length < 2) return setResultats([]);
    const t = setTimeout(() => {
      fetch(`/api/points-vente/recherche?q=${encodeURIComponent(recherche)}`).then((r) => (r.ok ? r.json() : { points: [] })).then((d) => setResultats(d.points || [])).catch(() => setResultats([]));
    }, 300);
    return () => clearTimeout(t);
  }, [recherche, onglet]);

  const estDivers = onglet === "DIVERS";
  const clientExistantId = onglet === "EXISTANT" ? client?.id ?? null : null;

  useEffect(() => {
    setPrixMemo({});
    if (!clientExistantId) return;
    fetch(`/api/prix-client?pointVenteId=${encodeURIComponent(clientExistantId)}`)
      .then((r) => (r.ok ? r.json() : { prix: [] }))
      .then((d) => setPrixMemo(Object.fromEntries((d.prix || []).map((p: any) => [p.gammeId, Number(p.prixCarton)]))))
      .catch(() => {});
  }, [clientExistantId]);
  useEffect(() => {
    const m = prixMemo[gammeId];
    setEtatPrix({ prix: m ? String(m) : "", memoriser: false });
  }, [prixMemo, gammeId, onglet]);

  const gammeChoisie = gammes.find((g) => g.id === gammeId);
  const paliers = useMemo(() => paliersTous.filter((p) => p.gammeId === gammeId), [paliersTous, gammeId]);
  const produitsGamme = produits.filter((p) => p.gammeId === gammeId && p.actif !== false);
  const lignes = produitsGamme.map((p) => ({ produit: p, quantite: quantites[p.id] || 0 })).filter((l) => l.quantite > 0);
  const prixSaisi = Math.round(Number(etatPrix.prix.replace(/\s/g, "")) || 0);
  const { totalCartons, prixCarton, montantTotal } = useMemo(() => calculerCommande(lignes.map((l) => ({ quantite: l.quantite })), paliers, prixSaisi), [lignes, paliers, prixSaisi]);
  const { montantRecu, resteAPayer } = calculerPaiement(modePaiement, montantTotal, montantRecuSaisi, mobileMoneyConfirme) as any;

  function changerGamme(id: string) {
    setGammeId(id);
    setQuantites({});
  }

  const clientOk =
    onglet === "DIVERS" ||
    (onglet === "EXISTANT" && !!client) ||
    (onglet === "NOUVEAU" && nv.nomEtablissement.trim().length >= 2 && !!nv.villeId);
  const peutEnregistrer = clientOk && !!commercialId && lignes.length > 0 && (modePaiement !== "MOBILE_MONEY" || !!operateurMobile);

  async function enregistrer() {
    setEnvoi(true);
    setErreur(null);
    const payload: Record<string, unknown> = {
      uuidClient: uuidCommande,
      commercialId,
      dateCommande,
      observations,
      dateLivraison: dateLivraison || undefined,
      modePaiement,
      montantRecu: modePaiement === "CREDIT_PARTIEL" ? montantRecuSaisi : undefined,
      mobileMoneyConfirme: modePaiement === "MOBILE_MONEY" ? mobileMoneyConfirme : undefined,
      operateurMobile: modePaiement === "MOBILE_MONEY" ? operateurMobile : undefined,
      lignes: lignes.map((l) => ({ produitId: l.produit.id, quantite: l.quantite })),
      echantillons: Object.entries(echantillons).filter(([, q]) => q > 0).map(([produitId, quantite]) => ({ produitId, quantite })),
      ...champsPrix(etatPrix, clientExistantId ? prixMemo[gammeId] ?? null : null, estDivers),
    };
    if (onglet === "EXISTANT") payload.pointVenteId = client!.id;
    else if (onglet === "DIVERS") payload.pointVenteId = ID_CLIENT_DIVERS;
    else payload.nouveauClient = { ...nv, nomEtablissement: nv.nomEtablissement.trim(), typeId: nv.typeId || null };
    try {
      const r = await fetch("/api/commandes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Échec de l'enregistrement.");
      const nom = onglet === "EXISTANT" ? client!.nomEtablissement : onglet === "DIVERS" ? "Client divers" : nv.nomEtablissement.trim();
      const com = commerciaux.find((c) => c.id === commercialId);
      setFait({ numero: d.numero || d.id?.slice(0, 8).toUpperCase(), detail: `${nom} · ${nombreFr(montantTotal)} FCFA · comptée pour ${com ? `${com.prenom} ${com.nom}` : "le commercial"}.` });
    } catch (e: any) {
      setErreur(e.message || "Échec de l'enregistrement.");
    } finally {
      setEnvoi(false);
    }
  }

  if (role && role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "SUPERVISEUR") {
    return <p className="py-10 text-center text-sm text-ink-muted">Accès non autorisé.</p>;
  }

  if (fait) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <div className="field-card space-y-4 text-center">
          <IconCheckCircle className="mx-auto h-10 w-10 text-ok" />
          <h1 className="font-display text-2xl text-ink">Commande enregistrée</h1>
          <p className="text-sm text-ink-muted">n° <span className="montant text-ink">{fait.numero}</span> · {fait.detail}</p>
          <p className="text-xs text-ink-muted">Elle est en attente de traitement dans la liste des commandes.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/commandes" className="btn-primary">Voir les commandes</Link>
            <button className="btn-secondary" onClick={() => window.location.reload()}>
              <IconPlus className="h-4 w-4" />
              Saisir une autre commande
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconReceipt className="h-5 w-5 text-brass" />
          Nouvelle commande
        </h1>
        <p className="text-sm text-ink-muted">Saisie au bureau — la commande est rattachée au commercial choisi et entre dans ses chiffres.</p>
      </div>

      {erreur && <div className="rounded-md border border-danger/40 bg-danger/10 px-3.5 py-3 text-sm text-danger">{erreur}</div>}

      <div className="field-card space-y-3">
        <p className="section-eyebrow"><IconStorefront className="h-4 w-4" />Client</p>
        <div className="flex flex-wrap gap-2">
          {([["EXISTANT", "Point de vente existant"], ["NOUVEAU", "Nouveau client"], ["DIVERS", "Client divers"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setOnglet(v)} className={`rounded-md border px-3 py-2 text-sm font-medium transition ${onglet === v ? "border-brass bg-brass text-white" : "border-line text-ink hover:border-brass"}`}>{l}</button>
          ))}
        </div>

        {onglet === "EXISTANT" && (client ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-bg-elevated px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{client.nomEtablissement}</p>
              <p className="text-xs text-ink-muted">{[client.nomVendeur, client.quartier, client.ville].filter(Boolean).join(" · ")}</p>
            </div>
            <button type="button" className="text-xs font-bold text-brass hover:underline" onClick={() => { setClient(null); setRecherche(""); }}>Changer</button>
          </div>
        ) : (
          <div>
            <input className="field-input" placeholder="Nom du point de vente, quartier, ville…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            {resultats.length > 0 && (
              <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                {resultats.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="w-full px-3 py-2 text-left hover:bg-bg-elevated" onClick={() => setClient(p)}>
                      <span className="block text-sm font-bold text-ink">{p.nomEtablissement}</span>
                      <span className="block text-xs text-ink-muted">{[p.quartier, p.ville].filter(Boolean).join(", ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {onglet === "NOUVEAU" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="field-label">Nom de l'établissement *</label><input className="field-input" value={nv.nomEtablissement} onChange={(e) => setNv({ ...nv, nomEtablissement: e.target.value })} /></div>
            <div><label className="field-label">Contact</label><input className="field-input" value={nv.nomVendeur} onChange={(e) => setNv({ ...nv, nomVendeur: e.target.value })} /></div>
            <div><label className="field-label">Téléphone</label><input className="field-input" inputMode="tel" value={nv.telVendeur} onChange={(e) => setNv({ ...nv, telVendeur: e.target.value })} /></div>
            <div><label className="field-label">Ville *</label>
              <select className="field-input" value={nv.villeId} onChange={(e) => setNv({ ...nv, villeId: e.target.value })}><option value="">Choisir…</option>{villes.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}</select></div>
            <div><label className="field-label">Type</label>
              <select className="field-input" value={nv.typeId} onChange={(e) => setNv({ ...nv, typeId: e.target.value })}><option value="">—</option>{types.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}</select></div>
            <div><label className="field-label">Quartier</label><input className="field-input" value={nv.quartier} onChange={(e) => setNv({ ...nv, quartier: e.target.value })} /></div>
            <div><label className="field-label">Repère</label><input className="field-input" value={nv.repereQuartier} onChange={(e) => setNv({ ...nv, repereQuartier: e.target.value })} /></div>
          </div>
        )}
        {onglet === "DIVERS" && <p className="text-sm text-ink-muted">Vente au détail : aucune fiche client n'est créée. Le prix négocié ne peut pas être mémorisé.</p>}
      </div>

      <div className="field-card space-y-3">
        <p className="section-eyebrow">Produits</p>
        {gammes.length > 1 && <GammeTabs gammes={gammes} value={gammeId} onChange={changerGamme} />}
        <PrixNegocie etat={etatPrix} onChange={setEtatPrix} memo={clientExistantId ? prixMemo[gammeId] ?? null : null} prixBase={paliers.length ? trouverPrixCarton(totalCartons || 1, paliers) : 0} estDivers={estDivers} gamme={gammeChoisie ? libelleGamme(gammeChoisie) : ""} />
        <div className="space-y-2">
          {produitsGamme.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-bg-elevated px-3 py-2.5">
              <span className="text-sm font-medium text-ink">{p.nom}</span>
              <QuantiteCartons valeur={quantites[p.id] || 0} onChange={(q) => setQuantites((e) => ({ ...e, [p.id]: Math.max(0, arrondirDemi(q)) }))} libelle={p.nom} />
            </div>
          ))}
        </div>
        {totalCartons > 0 && (
          <div className="space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between text-ink-muted"><span>Prix appliqué / carton</span><span className="font-medium text-ink">{nombreFr(prixCarton)} FCFA</span></div>
            <div className="flex justify-between border-t border-line pt-2"><span className="font-medium text-ink-muted">Total général</span><span className="font-display text-2xl text-ink">{nombreFr(montantTotal)} FCFA</span></div>
          </div>
        )}
      </div>

      <EchantillonsSection
        produits={produits.filter((p) => p.actif !== false)}
        gammeLibelle={(gid) => { const g = gammes.find((x) => x.id === gid); return g ? libelleGamme(g) : ""; }}
        quantites={echantillons}
        onChange={(id, q) => setEchantillons((e) => ({ ...e, [id]: q }))}
      />

      <div className="field-card space-y-3">
        <p className="section-eyebrow">Paiement</p>
        <select className="field-input" value={modePaiement} onChange={(e) => setModePaiement(e.target.value as ModePaiementValue)}>
          {MODES_PAIEMENT.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {modePaiement === "CREDIT_PARTIEL" && (
          <div><label className="field-label">Montant reçu</label>
            <input type="number" min={0} max={montantTotal} className="field-input" value={montantRecuSaisi || ""} onChange={(e) => setMontantRecuSaisi(Math.max(0, parseFloat(e.target.value) || 0))} /></div>
        )}
        {modePaiement === "MOBILE_MONEY" && (
          <div className="grid grid-cols-2 gap-2">
            {([["ORANGE_MONEY", "Orange Money"], ["MTN_MOMO", "MTN MoMo"]] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setOperateurMobile(v)} className={`rounded-md border px-3 py-2.5 text-sm font-medium transition ${operateurMobile === v ? "border-brass bg-brass text-white" : "border-line text-ink hover:border-brass"}`}>{l}</button>
            ))}
          </div>
        )}
        {modePaiement === "MOBILE_MONEY" && (
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="h-4 w-4" checked={mobileMoneyConfirme} onChange={(e) => setMobileMoneyConfirme(e.target.checked)} />Paiement Mobile Money confirmé</label>
        )}
        {totalCartons > 0 && (
          <div className="space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between text-ink-muted"><span>Montant reçu</span><span className="font-medium text-ok">{nombreFr(montantRecu)} FCFA</span></div>
            {resteAPayer > 0 && <div className="flex justify-between rounded-md bg-danger/10 px-2.5 py-1.5"><span className="font-medium text-danger">Reste à payer</span><span className="font-bold text-danger">{nombreFr(resteAPayer)} FCFA</span></div>}
          </div>
        )}
      </div>

      <div className="field-card grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label">Commercial concerné *</label>
          <select className="field-input" value={commercialId} onChange={(e) => setCommercialId(e.target.value)}>
            <option value="">Choisir le commercial…</option>
            {commerciaux.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
          </select>
        </div>
        <div><label className="field-label">Date de la commande</label><input type="date" className="field-input" max={aujourdhui()} value={dateCommande} onChange={(e) => setDateCommande(e.target.value || aujourdhui())} /></div>
        <div><label className="field-label">Livraison prévue</label><input type="date" className="field-input" value={dateLivraison} onChange={(e) => setDateLivraison(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="field-label">Observations</label><textarea className="field-input min-h-[80px]" value={observations} onChange={(e) => setObservations(e.target.value)} /></div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={enregistrer} disabled={!peutEnregistrer || envoi}>
          {envoi ? <Spinner className="h-4 w-4" /> : <IconClipboard className="h-4 w-4" />}
          {envoi ? "Enregistrement…" : "Enregistrer la commande"}
        </button>
        <Link href="/commandes" className="btn-secondary">Annuler</Link>
      </div>
    </div>
  );
}
