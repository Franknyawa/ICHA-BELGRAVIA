"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuid } from "uuid";
import { IconStorefront, IconGlass, IconReceipt, IconClipboard, IconDownload, IconPin } from "@/components/icons";
import { soumettre as soumettreSynchro } from "@/lib/syncEngine";
import ConfirmationEnregistrement from "@/components/ConfirmationEnregistrement";
import { ErreurEnvoi } from "@/lib/erreurEnvoi";
import { calculerCommande, calculerPaiement, trouverPrixCarton, montantLigne, MODES_PAIEMENT, type ModePaiementValue, type PalierPrix } from "@/lib/pricing";
import QuantiteCartons from "@/components/QuantiteCartons";
import PrixNegocie, { champsPrix, PRIX_VIDE, type EtatPrix } from "@/components/PrixNegocie";
import EchantillonsSection from "@/components/EchantillonsSection";
import { arrondirDemi, formaterCartons } from "@/lib/quantites";
import { ID_CLIENT_DIVERS } from "@/lib/clientDivers";
import { genererFacturePdf } from "@/lib/facturePdf";
import GammeTabs from "@/components/GammeTabs";
import { libelleGamme, type GammeInfo } from "@/lib/gammesClient";
import { Spinner, ChargementPage } from "@/components/Spinner";
import { nombreFr } from "@/lib/format";

type Produit = { id: string; nom: string; volumeMl: number; gammeId: string | null };
type PalierGamme = PalierPrix & { gammeId: string | null };
type Client = {
  id: string;
  nomEtablissement: string;
  nomVendeur: string | null;
  telVendeur: string | null;
  quartier: string | null;
  ville: string | null;
  distanceKm?: number | null;
};

function ligneVide() {
  return { produitId: "", quantiteCartons: 0 };
}

export default function NouvelleCommande() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg py-10 text-center text-sm text-ink-muted">Chargement…</div>}>
      <NouvelleCommandeInner />
    </Suspense>
  );
}

function NouvelleCommandeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pointVenteIdInitial = searchParams.get("pointVenteId");

  const [uuidCommande] = useState(() => uuid());
  const [produits, setProduits] = useState<Produit[]>([]);
  const [paliersTous, setPaliersTous] = useState<PalierGamme[]>([]);
  const [gammes, setGammes] = useState<GammeInfo[]>([]);
  const [gammeId, setGammeId] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [chargementClient, setChargementClient] = useState(!!pointVenteIdInitial);
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Client[]>([]);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [geolocalisationEnCours, setGeolocalisationEnCours] = useState(false);
  const [erreurGeolocalisation, setErreurGeolocalisation] = useState<string | null>(null);

  // Une ligne par produit du catalogue (fixe) — l'agent ne fait que
  // renseigner le nombre de cartons souhaité pour chacun, il ne peut pas
  // ajouter un produit hors catalogue (voir lib/pricing.ts pour le calcul
  // du prix, qui dépend du volume TOTAL de la commande, pas du produit).
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [echantillons, setEchantillons] = useState<Record<string, number>>({});
  const [etatPrix, setEtatPrix] = useState<EtatPrix>(PRIX_VIDE);
  const [prixMemo, setPrixMemo] = useState<Record<string, number>>({}); // prix enregistré du client, par gamme
  const [observations, setObservations] = useState("");
  const [dateLivraison, setDateLivraison] = useState("");
  const [modePaiement, setModePaiement] = useState<ModePaiementValue>("ESPECES");
  const [montantRecuSaisi, setMontantRecuSaisi] = useState(0);
  const [mobileMoneyConfirme, setMobileMoneyConfirme] = useState(false);
  const [operateurMobile, setOperateurMobile] = useState<"" | "ORANGE_MONEY" | "MTN_MOMO">("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageInfo, setMessageInfo] = useState<string | null>(null);
  const [nomAgent, setNomAgent] = useState("—");
  const [confirmation, setConfirmation] = useState<{ variante: "succes" | "local"; detail: string; numero: string } | null>(null);

  // Nom de l'agent pour la facture (hors ligne : reste « — », la facture admin est correcte).
  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((m) => m && setNomAgent(`${m.prenom} ${m.nom}`)).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/referentiels")
      .then((r) => r.json())
      .then((data) => {
        setProduits(data.produits || []);
        setGammes(data.gammes || []);
        setGammeId((prev) => prev || data.gammes?.[0]?.id || "");
        setPaliersTous(
          (data.paliersPrix || []).map((p: any) => ({
            gammeId: p.gammeId ?? null,
            cartonsMin: p.cartonsMin,
            cartonsMax: p.cartonsMax,
            prixCarton: Number(p.prixCarton),
          }))
        );
      });
  }, []);

  useEffect(() => {
    if (!pointVenteIdInitial) return;
    fetch(`/api/points-vente/${pointVenteIdInitial}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setClient(data);
        setChargementClient(false);
      })
      .catch(() => setChargementClient(false));
  }, [pointVenteIdInitial]);

  useEffect(() => {
    if (pointVenteIdInitial || recherche.trim().length < 2) {
      setResultats([]);
      return;
    }
    setRechercheEnCours(true);
    const t = setTimeout(() => {
      fetch(`/api/points-vente/recherche?q=${encodeURIComponent(recherche)}`)
        .then((r) => {
          if (!r.ok) throw new Error("recherche");
          return r.json();
        })
        .then((data) => setResultats(data.points || []))
        .catch(async () => {
          // Hors-ligne : recherche dans la liste des points de vente gardée sur l'appareil.
          try {
            const r = await fetch("/api/points-vente/hors-ligne");
            if (!r.ok) throw new Error("cache");
            const data = await r.json();
            const mot = recherche.trim().toLowerCase();
            setResultats(
              (data.points || [])
                .filter((p: any) =>
                  [p.nomEtablissement, p.quartier, p.repereQuartier, p.ville].some((v) =>
                    typeof v === "string" && v.toLowerCase().includes(mot)
                  )
                )
                .slice(0, 8)
            );
          } catch {
            setResultats([]);
          }
        })
        .finally(() => setRechercheEnCours(false));
    }, 300);
    return () => clearTimeout(t);
  }, [recherche, pointVenteIdInitial]);

  function rechercherAutourDeMoi() {
    setErreurGeolocalisation(null);
    if (!("geolocation" in navigator)) {
      setErreurGeolocalisation("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setGeolocalisationEnCours(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fetch(`/api/points-vente/recherche?lat=${latitude}&lng=${longitude}`)
          .then((r) => r.json())
          .then((data) => setResultats(data.points || []))
          .finally(() => setGeolocalisationEnCours(false));
      },
      () => {
        setErreurGeolocalisation("Impossible d'obtenir ta position — vérifie l'autorisation de localisation.");
        setGeolocalisationEnCours(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function modifierQuantite(produitId: string, quantite: number) {
    setQuantites((prev) => ({ ...prev, [produitId]: Math.max(0, arrondirDemi(quantite)) }));
  }

  const estDivers = client?.id === ID_CLIENT_DIVERS;

  // Prix négocié déjà enregistré pour ce client : proposé d'office (modifiable) dès le choix du client et de la gamme.
  useEffect(() => {
    setPrixMemo({});
    if (!client || client.id === ID_CLIENT_DIVERS) return;
    fetch(`/api/prix-client?pointVenteId=${encodeURIComponent(client.id)}`)
      .then((r) => (r.ok ? r.json() : { prix: [] }))
      .then((d) => setPrixMemo(Object.fromEntries((d.prix || []).map((p: any) => [p.gammeId, Number(p.prixCarton)]))))
      .catch(() => {});
  }, [client]);
  useEffect(() => {
    const m = prixMemo[gammeId];
    setEtatPrix({ prix: m ? String(m) : "", memoriser: false });
  }, [prixMemo, gammeId, client]);

  // Une commande = une seule gamme : le catalogue affiché et le barème de
  // prix appliqué sont ceux de la gamme sélectionnée (BELGRAVIA ou VDV).
  const gammeChoisie = gammes.find((g) => g.id === gammeId);
  const produitsGamme = useMemo(() => produits.filter((p) => p.gammeId === gammeId), [produits, gammeId]);
  const paliersPrix = useMemo(() => paliersTous.filter((p) => p.gammeId === gammeId), [paliersTous, gammeId]);

  function changerGamme(id: string) {
    setGammeId(id);
    setQuantites({}); // catalogue différent : on repart d'une commande vide
  }

  const lignesRetenues = useMemo(
    () =>
      produitsGamme
        .map((p) => ({ produit: p, quantite: quantites[p.id] || 0 }))
        .filter((l) => l.quantite > 0),
    [produitsGamme, quantites]
  );

  const { totalCartons, prixCarton, montantTotal } = useMemo(
    () => calculerCommande(lignesRetenues.map((l) => ({ quantite: l.quantite })), paliersPrix, Math.round(Number(etatPrix.prix.replace(/\s/g, "")) || 0)),
    [lignesRetenues, paliersPrix, etatPrix.prix]
  );

  const { montantRecu, resteAPayer } = useMemo(
    () => calculerPaiement(modePaiement, montantTotal, montantRecuSaisi, mobileMoneyConfirme),
    [modePaiement, montantTotal, montantRecuSaisi, mobileMoneyConfirme]
  );

  const peutEnregistrer =
    !!client &&
    paliersPrix.length > 0 &&
    lignesRetenues.length > 0 &&
    (modePaiement !== "CREDIT_PARTIEL" || montantRecuSaisi > 0);

  async function genererFacture(numero: string, date: Date) {
    if (!client) return;
    await genererFacturePdf({
      numero,
      date,
      pointVenteNom: client.nomEtablissement,
      villeNom: client.ville,
      quartier: client.quartier,
      gammeNom: gammeChoisie ? libelleGamme(gammeChoisie) : undefined,
      commercialNom: nomAgent,
      lignes: lignesRetenues.map((l) => ({
        code: gammeChoisie?.code,
        produitNom: l.produit.nom,
        quantiteCartons: l.quantite,
        prixCarton,
        sousTotal: montantLigne(l.quantite, prixCarton),
      })),
      montantTotal,
      modePaiement,
      montantRecu,
      resteAPayer,
    });
  }

  async function soumettre() {
    if (!client) return;
    if (modePaiement === "MOBILE_MONEY" && !operateurMobile) {
      setErreur("Choisissez l'opérateur Mobile Money : Orange Money ou MTN MoMo.");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    setMessageInfo(null);

    const payload = {
      uuidClient: uuidCommande,
      pointVenteId: client.id,
      observations,
      dateLivraison: dateLivraison || undefined,
      modePaiement,
      montantRecu: modePaiement === "CREDIT_PARTIEL" ? montantRecuSaisi : undefined,
      mobileMoneyConfirme: modePaiement === "MOBILE_MONEY" ? mobileMoneyConfirme : undefined,
      operateurMobile: modePaiement === "MOBILE_MONEY" ? operateurMobile : undefined,
      lignes: lignesRetenues.map((l) => ({ produitId: l.produit.id, quantite: l.quantite })),
      echantillons: Object.entries(echantillons).filter(([, q]) => q > 0).map(([produitId, quantite]) => ({ produitId, quantite })),
      ...champsPrix(etatPrix, prixMemo[gammeId] ?? null, estDivers),
    };

    try {
      const resultat = await soumettreSynchro<{ numero?: string }>({
        id: uuidCommande,
        type: "COMMANDE",
        titre: client.nomEtablissement,
        payload,
      });
      // La facture n'est plus téléchargée d'office : elle est proposée sur l'écran de
      // confirmation, avec le numéro attribué par le serveur (8 premiers caractères de l'id).
      const numero = (resultat as any).numero as string | undefined;
      setConfirmation({
        variante: "succes",
        numero: numero || uuidCommande.slice(0, 8).toUpperCase(),
        detail: `${client.nomEtablissement}${numero ? ` · n° ${numero}` : ""} · ${nombreFr(montantTotal)} FCFA.`,
      });
    } catch (e) {
      const err = e instanceof ErreurEnvoi ? e : null;
      if (!err || err.genre === "PERMANENTE") {
        setMessageInfo(null);
        setErreur(`${err ? err.message : "Échec de l'enregistrement."} Vérifie la commande puis réessaie.`);
      } else if (err.genre === "AUTH") {
        setErreur(null);
        setMessageInfo("Session expirée : la commande est gardée sur l'appareil. Reconnecte-toi, elle partira automatiquement.");
        setTimeout(() => router.push("/login"), 2500);
      } else {
        // Hors-ligne ou serveur indisponible : la commande est déjà sauvegardée sur l'appareil.
        // Le prix affiché vient du même barème que celui du serveur (lib/pricing.ts).
        setErreur(null);
        setConfirmation({
          variante: "local",
          numero: uuidCommande.slice(0, 8).toUpperCase(),
          detail:
            err.genre === "RESEAU"
              ? "Pas de connexion : elle est gardée sur l'appareil et partira automatiquement au retour du réseau."
              : `Le serveur est momentanément indisponible (${err.message}) : elle est gardée sur l'appareil et sera réessayée automatiquement.`,
        });
      }
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {confirmation && (
        <ConfirmationEnregistrement
          variante={confirmation.variante}
          titre={confirmation.variante === "succes" ? "Commande enregistrée" : "Commande gardée sur l'appareil"}
          detail={confirmation.detail}
          libelleBouton="Retour à l'accueil"
          delaiAuto={null}
          action={{
            libelle: "Télécharger la facture",
            libelleFait: "Facture téléchargée",
            executer: () => genererFacture(confirmation.numero, new Date()),
          }}
          onContinuer={() => router.push("/terrain")}
        />
      )}
      <h1 className="font-display text-2xl text-ink">Nouvelle commande</h1>

      {erreur && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3.5 py-3 text-sm text-danger">
          {erreur}
        </div>
      )}
      {messageInfo && (
        <div className="rounded-md border border-brass/40 bg-brass/10 px-3.5 py-3 text-sm text-brass">
          {messageInfo}
        </div>
      )}

      {/* Section Client */}
      <div className="field-card space-y-3">
        <p className="section-eyebrow">
          <IconStorefront className="h-4 w-4" />
          Client
        </p>

        {chargementClient && <p className="text-sm text-ink-muted">Chargement du point de vente…</p>}

        {!chargementClient && client && (
          <div className="rounded-md border border-line bg-bg-elevated px-3.5 py-3">
            <p className="font-medium text-ink">{client.nomEtablissement}</p>
            {estDivers ? (
              <p className="text-sm text-ink-muted">Vente au détail : aucune fiche client n'est créée.</p>
            ) : (
              <>
                <p className="text-sm text-ink-muted">
                  {[client.nomVendeur, client.telVendeur].filter(Boolean).join(" · ") || "Vendeur non précisé"}
                </p>
                <p className="text-sm text-ink-muted">
                  {[client.quartier, client.ville].filter(Boolean).join(", ") || "Localisation non précisée"}
                </p>
              </>
            )}
            {!pointVenteIdInitial && (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-brass hover:underline"
                onClick={() => setClient(null)}
              >
                Changer de point de vente
              </button>
            )}
          </div>
        )}

        {!chargementClient && !client && (
          <div>
            <div className="flex gap-2">
              <input
                className="field-input"
                placeholder="Nom de la boutique, quartier ou ville…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary flex-shrink-0 whitespace-nowrap"
                onClick={rechercherAutourDeMoi}
                disabled={geolocalisationEnCours}
              >
                <IconPin className="h-4 w-4" />
                {geolocalisationEnCours ? "…" : "Autour de moi"}
              </button>
            </div>
            <button
              type="button"
              className="btn-secondary mt-2 w-full"
              onClick={() => setClient({ id: ID_CLIENT_DIVERS, nomEtablissement: "CLIENT DIVERS", nomVendeur: null, telVendeur: null, quartier: null, ville: null })}
            >
              <IconStorefront className="h-4 w-4" />
              Client divers — vente au détail, sans fiche
            </button>
            {erreurGeolocalisation && <p className="mt-1 text-xs text-danger">{erreurGeolocalisation}</p>}
            {rechercheEnCours && <p className="mt-1 text-xs text-ink-muted">Recherche…</p>}
            {resultats.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {resultats.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setClient(r);
                        setResultats([]);
                        setRecherche("");
                      }}
                      className="w-full rounded-md border border-line bg-bg-elevated px-3 py-2 text-left text-sm hover:border-brass/50"
                    >
                      <span className="flex items-center justify-between">
                        <span className="font-medium text-ink">{r.nomEtablissement}</span>
                        {r.distanceKm !== null && r.distanceKm !== undefined && (
                          <span className="text-xs font-medium text-brass">{r.distanceKm} km</span>
                        )}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {[r.quartier, r.ville].filter(Boolean).join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!rechercheEnCours && recherche.trim().length >= 2 && resultats.length === 0 && (
              <p className="mt-1 text-xs text-ink-muted">Aucun point de vente trouvé pour cette recherche.</p>
            )}
          </div>
        )}
      </div>

      {/* Section Produits — catalogue figé, vente au carton uniquement */}
      <div className="field-card space-y-3">
        <p className="section-eyebrow">
          <IconGlass className="h-4 w-4" />
          Produits — vente au carton ou demi-carton
        </p>

        {gammes.length > 1 && <GammeTabs gammes={gammes} value={gammeId} onChange={changerGamme} avecToutes={false} />}

        {gammeId && paliersPrix.length === 0 && produits.length > 0 && (
          <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            Aucun barème de prix n'est encore configuré pour cette gamme — contacte l'administrateur.
          </p>
        )}

        {paliersPrix.length > 0 && (
          <details className="rounded-md border border-line bg-bg-elevated px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-ink">Grille tarifaire (prix / carton)</summary>
            <div className="mt-2 space-y-1">
              {paliersPrix.map((p) => {
                const actif = totalCartons > 0 && !etatPrix.prix && totalCartons >= p.cartonsMin && (p.cartonsMax === null || totalCartons < p.cartonsMax + 1);
                return (
                  <div key={p.cartonsMin} className={["flex justify-between rounded px-2 py-1", actif ? "bg-brass/10 text-brass font-medium" : "text-ink-muted"].join(" ")}>
                    <span>{p.cartonsMax === null ? `${p.cartonsMin} cartons et plus` : `${p.cartonsMin} à ${p.cartonsMax} cartons`}</span>
                    <span>{nombreFr(p.prixCarton)} FCFA</span>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        <PrixNegocie
          etat={etatPrix}
          onChange={setEtatPrix}
          memo={prixMemo[gammeId] ?? null}
          prixBase={paliersPrix.length ? trouverPrixCarton(totalCartons || 1, paliersPrix) : 0}
          estDivers={estDivers}
          gamme={gammeChoisie ? libelleGamme(gammeChoisie) : ""}
        />

        <div className="space-y-2">
          {produitsGamme.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-bg-elevated px-3 py-2.5">
              <span className="text-sm font-medium text-ink">{p.nom}</span>
              <QuantiteCartons valeur={quantites[p.id] || 0} onChange={(q) => modifierQuantite(p.id, q)} libelle={p.nom} />
            </div>
          ))}
          {produits.length === 0 && (
            <p className="py-2 text-center text-sm text-ink-muted">Chargement du catalogue…</p>
          )}
          {produits.length > 0 && produitsGamme.length === 0 && (
            <p className="py-2 text-center text-sm text-ink-muted">Aucun produit actif dans cette gamme.</p>
          )}
        </div>

        {totalCartons > 0 && (
          <div className="space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex items-center justify-between text-ink-muted">
              <span>Total cartons</span>
              <span className="font-medium text-ink">{totalCartons}</span>
            </div>
            <div className="flex items-center justify-between text-ink-muted">
              <span>Prix appliqué / carton</span>
              <span className="font-medium text-ink">{nombreFr(prixCarton)} FCFA</span>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-2">
              <span className="font-medium text-ink-muted">Total général</span>
              <span className="font-display text-2xl text-ink">{nombreFr(montantTotal)} FCFA</span>
            </div>
          </div>
        )}
      </div>

      <EchantillonsSection
        produits={produits.filter((p: any) => p.actif !== false)}
        gammeLibelle={(gid) => { const g = gammes.find((x) => x.id === gid); return g ? libelleGamme(g) : ""; }}
        quantites={echantillons}
        onChange={(id, q) => setEchantillons((e) => ({ ...e, [id]: q }))}
      />

      {/* Section Paiement */}
      <div className="field-card space-y-3">
        <p className="section-eyebrow">
          <IconReceipt className="h-4 w-4" />
          Paiement
        </p>

        <div>
          <label className="field-label">Mode de paiement</label>
          <select
            className="field-input"
            value={modePaiement}
            onChange={(e) => setModePaiement(e.target.value as ModePaiementValue)}
          >
            {MODES_PAIEMENT.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {modePaiement === "CREDIT_PARTIEL" && (
          <div>
            <label className="field-label">Montant reçu maintenant</label>
            <input
              type="number"
              min={0}
              max={montantTotal}
              className="field-input"
              value={montantRecuSaisi || ""}
              onChange={(e) => setMontantRecuSaisi(Math.max(0, parseFloat(e.target.value) || 0))}
            />
          </div>
        )}

        {modePaiement === "MOBILE_MONEY" && (
          <div>
            <label className="field-label">Opérateur</label>
            <div className="grid grid-cols-2 gap-2">
              {([["ORANGE_MONEY", "Orange Money"], ["MTN_MOMO", "MTN MoMo"]] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setOperateurMobile(v)}
                  className={`rounded-md border px-3 py-2.5 text-sm font-medium transition ${
                    operateurMobile === v ? "border-brass bg-brass text-white" : "border-line text-ink hover:border-brass"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        {modePaiement === "MOBILE_MONEY" && (
          <label className="flex items-center gap-2 rounded-md border border-line bg-bg-elevated px-3 py-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={mobileMoneyConfirme}
              onChange={(e) => setMobileMoneyConfirme(e.target.checked)}
              className="h-4 w-4"
            />
            Paiement Mobile Money confirmé (SMS reçu)
          </label>
        )}
        {modePaiement === "MOBILE_MONEY" && !mobileMoneyConfirme && (
          <p className="text-xs text-ink-muted">
            Tant que ce n'est pas confirmé, la commande est enregistrée avec le montant total en
            reste à payer — coche la case dès réception du SMS de confirmation.
          </p>
        )}

        {totalCartons > 0 && (
          <div className="space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex items-center justify-between text-ink-muted">
              <span>Montant reçu</span>
              <span className="font-medium text-ok">{nombreFr(montantRecu)} FCFA</span>
            </div>
            {resteAPayer > 0 && (
              <div className="flex items-center justify-between rounded-md bg-danger/10 px-2.5 py-1.5">
                <span className="font-medium text-danger">Reste à payer</span>
                <span className="font-bold text-danger">{nombreFr(resteAPayer)} FCFA</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="field-card space-y-3">
        <div>
          <label className="field-label">Date de livraison souhaitée</label>
          <input
            type="date"
            className="field-input"
            value={dateLivraison}
            onChange={(e) => setDateLivraison(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div>
          <label className="field-label">Observations</label>
          <textarea
            className="field-input min-h-[80px]"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
          />
        </div>
      </div>

      <button type="button" className="btn-primary w-full py-4" onClick={soumettre} disabled={!peutEnregistrer || envoi}>
        <IconClipboard className="h-4 w-4" />
        {envoi && <Spinner className="h-4 w-4" />}
        {envoi ? "Enregistrement…" : "Enregistrer la commande"}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
        <IconDownload className="h-3.5 w-3.5" />
        La facture PDF se télécharge automatiquement une fois la commande enregistrée.
      </p>
    </div>
  );
}
