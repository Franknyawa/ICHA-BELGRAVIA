"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuid } from "uuid";
import { IconStorefront, IconGlass, IconReceipt, IconClipboard, IconDownload, IconPin } from "@/components/icons";
import { enqueuerCommande } from "@/lib/offlineQueue";
import { envoyerCommande } from "@/lib/envoyerCommande";
import { ErreurEnvoi } from "@/lib/erreurEnvoi";
import { calculerCommande, calculerPaiement, MODES_PAIEMENT, type ModePaiementValue, type PalierPrix } from "@/lib/pricing";
import { genererFacturePdf } from "@/lib/facturePdf";
import GammeTabs from "@/components/GammeTabs";
import { libelleGamme, type GammeInfo } from "@/lib/gammesClient";

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
  const [observations, setObservations] = useState("");
  const [dateLivraison, setDateLivraison] = useState("");
  const [modePaiement, setModePaiement] = useState<ModePaiementValue>("ESPECES");
  const [montantRecuSaisi, setMontantRecuSaisi] = useState(0);
  const [mobileMoneyConfirme, setMobileMoneyConfirme] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageInfo, setMessageInfo] = useState<string | null>(null);

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
        .then((r) => r.json())
        .then((data) => setResultats(data.points || []))
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
    setQuantites((prev) => ({ ...prev, [produitId]: Math.max(0, quantite) }));
  }

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
    () => calculerCommande(lignesRetenues.map((l) => ({ quantite: l.quantite })), paliersPrix),
    [lignesRetenues, paliersPrix]
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
      commercialNom: "—", // affiché correctement depuis la liste admin ; ici l'agent connaît déjà son nom
      lignes: lignesRetenues.map((l) => ({
        produitNom: l.produit.nom,
        quantiteCartons: l.quantite,
        prixCarton,
        sousTotal: l.quantite * prixCarton,
      })),
      montantTotal,
      modePaiement,
      montantRecu,
      resteAPayer,
    });
  }

  async function soumettre() {
    if (!client) return;
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
      lignes: lignesRetenues.map((l) => ({ produitId: l.produit.id, quantite: l.quantite })),
    };

    try {
      const resultat = await envoyerCommande(payload);
      // La facture est générée immédiatement après l'enregistrement réussi,
      // avec le numéro attribué par le serveur (8 premiers caractères de
      // l'id, en majuscules — cohérent avec la liste admin des factures).
      try {
        await genererFacture((resultat as any).numero || uuidCommande.slice(0, 8).toUpperCase(), new Date());
      } catch {
        // La commande est déjà enregistrée : un échec de génération du PDF
        // (rare, ex. navigateur qui bloque le téléchargement) ne doit pas
        // bloquer le retour à l'accueil — la facture reste régénérable
        // depuis l'admin (onglet Factures).
      }
      router.push("/terrain");
    } catch (e) {
      // Voir le même correctif dans app/(commercial)/terrain/nouvelle-visite/page.tsx :
      // on distingue une vraie coupure réseau d'une erreur serveur, pour ne
      // plus afficher "pas de connexion" quand ce n'est pas le problème.
      const erreurServeur = e instanceof ErreurEnvoi && !e.estErreurReseau;
      if (erreurServeur) console.error("[nouvelle-commande] échec serveur :", e);

      try {
        await enqueuerCommande({ id: uuidCommande, payload, createdAt: Date.now() });
        if (erreurServeur) {
          setErreur(
            `L'enregistrement a échoué côté serveur (${(e as ErreurEnvoi).message}). La commande est conservée sur l'appareil et sera réessayée automatiquement, mais tant que cette erreur persiste elle ne partira pas — signale ce message à l'administrateur.`
          );
          setMessageInfo(null);
        } else {
          // Hors-ligne : le prix affiché ici vient du même barème que le
          // serveur appliquera à la synchronisation (voir lib/pricing.ts),
          // donc la facture générée maintenant sera la bonne dans l'immense
          // majorité des cas — sauf si le barème est modifié entre-temps.
          try {
            await genererFacture(uuidCommande.slice(0, 8).toUpperCase(), new Date());
          } catch {
            /* voir commentaire équivalent ci-dessus */
          }
          setErreur(null);
          setMessageInfo(
            "Pas de connexion : la commande a été enregistrée sur l'appareil et sera envoyée automatiquement dès le retour du réseau."
          );
          setTimeout(() => router.push("/terrain"), 1800);
        }
      } catch {
        setErreur("Échec de l'enregistrement, y compris en local. Réessayez.");
      }
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
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
            <p className="text-sm text-ink-muted">
              {[client.nomVendeur, client.telVendeur].filter(Boolean).join(" · ") || "Vendeur non précisé"}
            </p>
            <p className="text-sm text-ink-muted">
              {[client.quartier, client.ville].filter(Boolean).join(", ") || "Localisation non précisée"}
            </p>
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
          Produits — vente au carton
        </p>

        {gammes.length > 1 && <GammeTabs gammes={gammes} value={gammeId} onChange={changerGamme} avecToutes={false} />}

        {gammeId && paliersPrix.length === 0 && produits.length > 0 && (
          <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            Aucun barème de prix n'est encore configuré pour cette gamme — contacte l'administrateur.
          </p>
        )}

        <div className="space-y-2">
          {produitsGamme.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-bg-elevated px-3 py-2.5">
              <span className="text-sm font-medium text-ink">{p.nom}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary h-8 w-8 !p-0 text-base leading-none"
                  onClick={() => modifierQuantite(p.id, (quantites[p.id] || 0) - 1)}
                  aria-label={`Retirer un carton de ${p.nom}`}
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="field-input w-16 text-center"
                  value={quantites[p.id] || 0}
                  onChange={(e) => modifierQuantite(p.id, parseInt(e.target.value, 10) || 0)}
                />
                <button
                  type="button"
                  className="btn-secondary h-8 w-8 !p-0 text-base leading-none"
                  onClick={() => modifierQuantite(p.id, (quantites[p.id] || 0) + 1)}
                  aria-label={`Ajouter un carton de ${p.nom}`}
                >
                  +
                </button>
              </div>
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
              <span className="font-medium text-ink">{prixCarton.toLocaleString("fr-FR")} FCFA</span>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-2">
              <span className="font-medium text-ink-muted">Total général</span>
              <span className="font-display text-2xl text-ink">{montantTotal.toLocaleString("fr-FR")} FCFA</span>
            </div>
          </div>
        )}
      </div>

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
              <span className="font-medium text-ok">{montantRecu.toLocaleString("fr-FR")} FCFA</span>
            </div>
            {resteAPayer > 0 && (
              <div className="flex items-center justify-between rounded-md bg-danger/10 px-2.5 py-1.5">
                <span className="font-medium text-danger">Reste à payer</span>
                <span className="font-bold text-danger">{resteAPayer.toLocaleString("fr-FR")} FCFA</span>
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
        {envoi ? "Enregistrement…" : "Enregistrer la commande"}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
        <IconDownload className="h-3.5 w-3.5" />
        La facture PDF se télécharge automatiquement une fois la commande enregistrée.
      </p>
    </div>
  );
}
