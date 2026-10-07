"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import StepIndicator from "@/components/form/StepIndicator";
import { ChoiceGroup, MultiChoiceGroup } from "@/components/form/ChoiceGroup";
import AffluenceGrid, { type Affluence } from "@/components/form/AffluenceGrid";
import BlocBoissons, { type ValeurBoisson, type BoissonLibre } from "@/components/form/BlocBoissons";
import { resolveVilleDepuisCoordonnees, matchVille } from "@/lib/reverseGeocode";
import { soumettre as soumettreSynchro } from "@/lib/syncEngine";
import { ErreurEnvoi } from "@/lib/erreurEnvoi";
import { compresserImage } from "@/lib/compresserImage";
import { IconStorefront, IconPhone, IconPin, IconCamera, IconGlass, IconClock, IconCheckCircle, IconClipboard } from "@/components/icons";
import { Spinner, ChargementPage } from "@/components/Spinner";

type Referentiels = {
  villes: { id: string; nom: string }[];
  types: { id: string; nom: string }[];
  marques: { id: string; nom: string; categorie: "MOUSSEUX" | "RTD" }[];
};

const LIBRES_VIDES = (): BoissonLibre[] => [
  { nom: "", prix: "" },
  { nom: "", prix: "" },
  { nom: "", prix: "" },
];

/** Prix saisi ("12500") → nombre, ou undefined si vide / invalide. */
function versPrix(brut: string): number | undefined {
  const n = parseFloat(brut.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && brut.trim() !== "" ? n : undefined;
}

type PhotoSlot = { uuidClient: string; preview: string | null; url: string | null; enCours: boolean };

export default function NouvelleVisite() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [ref, setRef] = useState<Referentiels | null>(null);
  const [agent, setAgent] = useState<{ nom: string; prenom: string } | null>(null);
  const [maintenant] = useState(() => new Date());
  const [uuidVisite] = useState(() => uuid());
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageInfo, setMessageInfo] = useState<string | null>(null);

  // Section 2
  const [nomEtablissement, setNomEtablissement] = useState("");
  // Contact sur place : la personne rencontrée (répondant) puis, si ce n'est
  // pas le patron, le patron lui-même — on garde son numéro dans tous les cas.
  const [repondant, setRepondant] = useState<string>();
  const [repondantAutrePrecision, setRepondantAutrePrecision] = useState("");
  const [nomRepondant, setNomRepondant] = useState("");
  const [telRepondant, setTelRepondant] = useState("");
  const [nomPatron, setNomPatron] = useState("");
  const [telPatron, setTelPatron] = useState("");
  const [villeId, setVilleId] = useState("");
  const [villeResolue, setVilleResolue] = useState<string | null>(null);
  const [villeCandidats, setVilleCandidats] = useState<string[]>([]);
  const [quartier, setQuartier] = useState("");
  const [repereQuartier, setRepereQuartier] = useState("");
  // Un établissement peut cumuler plusieurs types (ex. bar + restaurant).
  const [typesChoisis, setTypesChoisis] = useState<string[]>([]);
  const [typeAutrePrecision, setTypeAutrePrecision] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; precision: number } | null>(null);
  const [gpsEnCours, setGpsEnCours] = useState(false);
  const [photos, setPhotos] = useState<[PhotoSlot, PhotoSlot]>([
    { uuidClient: uuid(), preview: null, url: null, enCours: false },
    { uuidClient: uuid(), preview: null, url: null, enCours: false },
  ]);

  // Section 3
  const [vendSpiritueux, setVendSpiritueux] = useState<boolean | undefined>();
  // Boissons relevées sur place, par marque du référentiel (présence + prix)
  // puis 3 lignes libres par catégorie — visibles seulement si le point de
  // vente vend des spiritueux.
  const [boissons, setBoissons] = useState<Record<string, ValeurBoisson>>({});
  const [libresMousseux, setLibresMousseux] = useState<BoissonLibre[]>(LIBRES_VIDES());
  const [libresRtd, setLibresRtd] = useState<BoissonLibre[]>(LIBRES_VIDES());
  const [capaciteEstimee, setCapaciteEstimee] = useState<string>();
  const [salleClimatisee, setSalleClimatisee] = useState<boolean>();
  const [ecranTv, setEcranTv] = useState<boolean>();
  const [affluence, setAffluence] = useState<Affluence>({});
  const [fournisseurs, setFournisseurs] = useState({
    grossiste: false,
    marche: false,
    livraison: false,
    autre: false,
    neSaitPas: false,
  });
  const [fournisseurAutrePrecision, setFournisseurAutrePrecision] = useState("");

  // Section 4
  const [potentielEstime, setPotentielEstime] = useState<string>();
  const [interesseVisiteCommerciale, setInteresseVisiteCommerciale] = useState<boolean>();
  const [observations, setObservations] = useState("");
  const [veutCommander, setVeutCommander] = useState<boolean>();

  useEffect(() => {
    fetch("/api/referentiels").then((r) => r.json()).then(setRef);
    fetch("/api/me").then((r) => r.json()).then(setAgent);
  }, []);

  // Filet de sécurité : si la position a été capturée avant que les villes
  // du référentiel ne soient chargées (course au chargement), on retente le
  // rapprochement dès qu'elles arrivent, sans redemander le GPS.
  useEffect(() => {
    if (ref && !villeId && villeCandidats.length > 0) {
      const match = matchVille(villeCandidats, ref.villes);
      if (match) setVilleId(match.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  // Capture automatique de la position dès l'arrivée sur l'étape "Point de
  // vente" (section Localisation) : la ville et les coordonnées exactes sont
  // récupérées sans action de l'agent — seul le quartier reste manuel.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step === 2 && !gps && !gpsEnCours) {
      capturerPosition();
    }
  }, [step]);

  function capturerPosition() {
    if (!navigator.geolocation) {
      setErreur("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setGpsEnCours(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGps({ lat: latitude, lng: longitude, precision: accuracy });
        const { affichage, candidats } = await resolveVilleDepuisCoordonnees(latitude, longitude);
        setVilleResolue(affichage);
        setVilleCandidats(candidats);
        if (ref) {
          const match = matchVille(candidats, ref.villes);
          if (match) setVilleId(match.id);
        }
        setGpsEnCours(false);
      },
      () => {
        setGpsEnCours(false);
        setErreur("Impossible de récupérer la position GPS. Vérifiez les autorisations de localisation.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function handlePhotoChange(index: 0 | 1, file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrlOriginal = reader.result as string;

      // Redimensionne/recompresse AVANT tout envoi ou stockage : une photo
      // brute d'iPhone dépasse souvent la limite de 4,5 Mo par requête que
      // Vercel impose à ses fonctions serverless (erreur plateforme
      // "FUNCTION_PAYLOAD_TOO_LARGE", 413) — c'était la vraie cause de
      // l'échec systématique de l'envoi des visites avec photo, pas un
      // problème de connexion ni d'hébergement (voir lib/compresserImage.ts).
      let dataUrl = dataUrlOriginal;
      try {
        dataUrl = await compresserImage(dataUrlOriginal);
      } catch {
        // Si la compression échoue pour une raison quelconque, on retente
        // l'envoi avec l'original plutôt que de bloquer la capture.
      }

      setPhotos((prev) => {
        const next = [...prev] as [PhotoSlot, PhotoSlot];
        next[index] = { ...next[index], preview: dataUrl, enCours: true };
        return next;
      });
      // Upload optimiste immédiat : accélère l'envoi final si le réseau est
      // disponible. En cas d'échec (hors-ligne), la photo reste en data URL
      // dans l'état local et sera uploadée au moment de la synchronisation
      // (voir lib/syncEngine.ts) — la capture elle-même n'est jamais bloquée.
      try {
        const res = await fetch("/api/photos/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setPhotos((prev) => {
          const next = [...prev] as [PhotoSlot, PhotoSlot];
          next[index] = { ...next[index], url: data.url, enCours: false };
          return next;
        });
      } catch {
        setPhotos((prev) => {
          const next = [...prev] as [PhotoSlot, PhotoSlot];
          next[index] = { ...next[index], enCours: false };
          return next;
        });
      }
    };
    reader.readAsDataURL(file);
  }

  const peutAvancer = useMemo(() => {
    if (step === 2) return nomEtablissement.trim().length > 0;
    return true;
  }, [step, nomEtablissement]);

  // Accès direct à une rubrique depuis les icônes du haut : seul le nom de
  // l'établissement est indispensable pour dépasser la rubrique "Point de vente".
  const peutAllerA = (index: number) => index <= 2 || nomEtablissement.trim().length > 0;

  // Chaque changement de rubrique repart du haut de la page.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  async function soumettre() {
    setEnvoi(true);
    setErreur(null);
    setMessageInfo(null);

    const affluenceArray = Object.entries(affluence)
      .filter(([, creneaux]) => creneaux.length > 0)
      .map(([jour, creneaux]) => ({ jour, creneaux }));

    // Les boissons ne sont envoyées que si le point de vente vend des
    // spiritueux (sinon la section est masquée et ne doit rien enregistrer).
    const marquesPresentes: {
      marqueId?: string;
      libelleLibre?: string;
      categorie: "MOUSSEUX" | "RTD";
      prix?: number;
    }[] = [];
    if (vendSpiritueux) {
      for (const m of ref?.marques || []) {
        const v = boissons[m.id];
        if (v?.present) marquesPresentes.push({ marqueId: m.id, categorie: m.categorie, prix: versPrix(v.prix) });
      }
      for (const [categorie, libres] of [
        ["MOUSSEUX", libresMousseux],
        ["RTD", libresRtd],
      ] as const) {
        for (const l of libres) {
          if (l.nom.trim()) {
            marquesPresentes.push({ libelleLibre: l.nom.trim(), categorie, prix: versPrix(l.prix) });
          }
        }
      }
    }

    // Contact sur place : si le répondant est le patron, ses coordonnées sont
    // aussi le contact principal ; sinon le contact est le répondant et le
    // patron est enregistré à part.
    const repondantEstPatron = repondant === "PATRON";
    const contactNom = repondantEstPatron ? nomPatron : nomRepondant;
    const contactTel = repondantEstPatron ? telPatron : telRepondant;

    const payload = {
      uuidClient: uuidVisite,
      dateVisite: maintenant.toISOString(),
      pointVente: {
        nomEtablissement,
        nomVendeur: contactNom,
        telVendeur: contactTel,
        nomPatron,
        telPatron,
        villeId: villeId || null,
        quartier,
        repereQuartier,
        typeNoms: typesChoisis,
        typeAutrePrecision: typesChoisis.includes("Autre") ? typeAutrePrecision : "",
        latitude: gps?.lat,
        longitude: gps?.lng,
        precisionGps: gps?.precision,
      },
      offrePotentiel: {
        vendSpiritueux,
        capaciteEstimee,
        salleClimatisee,
        ecranTv,
        affluence: affluenceArray,
        fournisseurGrossiste: fournisseurs.grossiste,
        fournisseurMarche: fournisseurs.marche,
        fournisseurLivraison: fournisseurs.livraison,
        fournisseurAutre: fournisseurs.autre,
        fournisseurAutrePrecision: fournisseurs.autre ? fournisseurAutrePrecision : "",
        fournisseurNeSaitPas: fournisseurs.neSaitPas,
      },
      qualification: {
        potentielEstime,
        interesseVisiteCommerciale,
        observations,
        repondant,
        repondantAutrePrecision: repondant === "AUTRE" ? repondantAutrePrecision : "",
        veutCommander,
      },
      marquesPresentes,
    };

    const photosPayload = photos.map((p) => ({
      uuidClient: p.uuidClient,
      dataUrl: p.preview || "",
      url: p.url || undefined,
    })).filter((p) => p.dataUrl);

    try {
      const resultat = await soumettreSynchro<{ pointVenteId: string }>({
        id: uuidVisite,
        type: "VISITE",
        titre: nomEtablissement,
        payload,
        photos: photosPayload,
      });
      if (veutCommander) {
        router.push(`/terrain/nouvelle-commande?pointVenteId=${resultat.pointVenteId}`);
      } else {
        router.push("/terrain");
      }
    } catch (e) {
      // La visite est écrite sur l'appareil AVANT l'envoi (lib/syncEngine.ts) :
      // sauf refus définitif du serveur, elle est conservée et réessayée seule.
      const err = e instanceof ErreurEnvoi ? e : null;
      if (!err || err.genre === "PERMANENTE") {
        setMessageInfo(null);
        setErreur(
          `${err ? err.message : "Échec de l'enregistrement."} Corrige le formulaire puis réessaie.`
        );
      } else if (err.genre === "AUTH") {
        setErreur(null);
        setMessageInfo("Session expirée : la visite est gardée sur l'appareil. Reconnecte-toi, elle partira automatiquement.");
        setTimeout(() => router.push("/login"), 2500);
      } else {
        setErreur(null);
        const suite = veutCommander
          ? " Pense à saisir la commande (bouton \"Nouvelle commande\") une fois la visite synchronisée."
          : "";
        setMessageInfo(
          (err.genre === "RESEAU"
            ? "Pas de connexion : la visite est enregistrée sur l'appareil et partira automatiquement au retour du réseau."
            : `Le serveur est momentanément indisponible (${err.message}) : la visite est enregistrée sur l'appareil et sera réessayée automatiquement.`) + suite
        );
        setTimeout(() => router.push("/terrain"), veutCommander ? 3200 : 2200);
      }
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Reste visible sous l'en-tête pendant le défilement : on change de
          rubrique d'un appui, sans remonter ni redescendre la page. */}
      <div className="sticky top-[3.75rem] z-[9] -mx-4 mb-5 border-b border-line/60 bg-bg/95 px-4 pb-1 pt-2 backdrop-blur">
        <StepIndicator step={step} onSelect={setStep} peutAller={peutAllerA} />
      </div>

      {erreur && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3.5 py-3 text-sm text-danger">
          {erreur}
        </div>
      )}

      {messageInfo && (
        <div className="mb-4 rounded-md border border-brass/40 bg-brass/10 px-3.5 py-3 text-sm text-brass-soft">
          {messageInfo}
        </div>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <h1 className="font-display text-2xl text-ink">Informations de visite</h1>
          <div className="field-card space-y-3">
            <Ligne label="Date de la visite" valeur={maintenant.toLocaleDateString("fr-FR")} />
            <Ligne
              label="Heure de la visite"
              valeur={maintenant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            />
            <Ligne
              label="Agent commercial"
              valeur={agent ? `${agent.prenom} ${agent.nom}` : "Chargement…"}
            />
          </div>
          <p className="text-sm text-ink-muted">
            Ces informations sont enregistrées automatiquement. Continuez pour recenser le point de vente.
          </p>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <h1 className="font-display text-2xl text-ink">Point de vente</h1>

          <SousSection titre="Identification" icon={IconStorefront}>
            <Champ label="Nom de l'établissement" required>
              <input className="field-input" value={nomEtablissement} onChange={(e) => setNomEtablissement(e.target.value)} />
            </Champ>
            <Champ label="Type d'établissement (plusieurs choix possibles)">
              <MultiChoiceGroup
                options={TYPES_ETABLISSEMENT.map((t) => ({ value: t, label: t }))}
                values={typesChoisis}
                onToggle={(nom) =>
                  setTypesChoisis((prev) => (prev.includes(nom) ? prev.filter((n) => n !== nom) : [...prev, nom]))
                }
              />
              {typesChoisis.includes("Autre") && (
                <input
                  className="field-input mt-2"
                  placeholder="Précisez le type d'établissement"
                  value={typeAutrePrecision}
                  onChange={(e) => setTypeAutrePrecision(e.target.value)}
                />
              )}
            </Champ>
          </SousSection>

          <SousSection titre="Contact sur place" icon={IconPhone}>
            <Champ label="Qui nous répond ?">
              <ChoiceGroup
                options={[
                  { value: "PATRON", label: "Patron" },
                  { value: "GERANT", label: "Gérant" },
                  { value: "EMPLOYE", label: "Employé" },
                  { value: "AUTRE", label: "Autre" },
                ]}
                value={repondant}
                onChange={setRepondant}
              />
            </Champ>

            {repondant && (
              <div className="space-y-3 rounded-md border border-line/70 bg-bg-elevated/60 p-3">
                {repondant === "AUTRE" && (
                  <Champ label="Fonction du répondant">
                    <input
                      className="field-input"
                      placeholder="Ex. serveur, voisin, comptable…"
                      value={repondantAutrePrecision}
                      onChange={(e) => setRepondantAutrePrecision(e.target.value)}
                    />
                  </Champ>
                )}

                {repondant === "PATRON" ? (
                  <ContactChamps
                    nomLabel="Nom du patron"
                    telLabel="Tél. du patron"
                    nom={nomPatron}
                    tel={telPatron}
                    onNom={setNomPatron}
                    onTel={setTelPatron}
                  />
                ) : (
                  <>
                    <ContactChamps
                      nomLabel={`Nom ${articleRepondant(repondant)}`}
                      telLabel={`Tél. ${articleRepondant(repondant)}`}
                      nom={nomRepondant}
                      tel={telRepondant}
                      onNom={setNomRepondant}
                      onTel={setTelRepondant}
                    />
                    <div className="border-t border-line/70 pt-3">
                      <ContactChamps
                        nomLabel="Nom du patron"
                        telLabel="Tél. du patron"
                        nom={nomPatron}
                        tel={telPatron}
                        onNom={setNomPatron}
                        onTel={setTelPatron}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </SousSection>

          <SousSection titre="Localisation" icon={IconPin}>
            <Champ label="Localisation GPS de la boutique">
              <button
                type="button"
                onClick={capturerPosition}
                disabled={gpsEnCours}
                className="btn-secondary w-full"
              >
                {gpsEnCours ? <Spinner className="h-4 w-4" /> : <IconPin className="h-4 w-4" />}
                {gpsEnCours ? "Localisation en cours…" : gps ? "Recapturer la position" : "Capturer la position GPS"}
              </button>
              <div className="field-input mt-2 flex min-h-[52px] items-center text-sm">
                {gpsEnCours && <span className="text-ink-muted">Récupération de la position…</span>}
                {!gpsEnCours && gps && (
                  <span className="text-ink">
                    {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                    <span className="text-ink-muted"> (précision ±{Math.round(gps.precision)} m)</span>
                  </span>
                )}
                {!gpsEnCours && !gps && (
                  <span className="text-ink-muted">
                    Position non capturée — appuyez sur le bouton ci-dessus.
                  </span>
                )}
              </div>
            </Champ>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Champ label="Ville">
                <select className="field-input" value={villeId} onChange={(e) => setVilleId(e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {ref?.villes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nom}
                    </option>
                  ))}
                </select>
                {villeResolue && (
                  <p className="mt-1 text-xs text-ink-muted">Détectée automatiquement : {villeResolue}</p>
                )}
              </Champ>
              <Champ label="Quartier">
                <input className="field-input" value={quartier} onChange={(e) => setQuartier(e.target.value)} />
                <p className="mt-1 text-xs text-ink-muted">À renseigner manuellement</p>
              </Champ>
            </div>
            <Champ label="Repère du quartier">
              <input
                className="field-input"
                placeholder="Ex. en face de la pharmacie…"
                value={repereQuartier}
                onChange={(e) => setRepereQuartier(e.target.value)}
              />
            </Champ>
          </SousSection>

          <SousSection titre="Devanture" icon={IconCamera}>
            <Champ label="Photos de la devanture (2)">
              <div className="grid grid-cols-2 gap-3">
                {photos.map((slot, i) => (
                  <label
                    key={i}
                    className="flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-bg-elevated text-center"
                  >
                    {slot.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slot.preview} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                    ) : (
                      <span className="px-2 text-xs text-ink-muted">Photo {i + 1}<br />Toucher pour capturer</span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handlePhotoChange(i as 0 | 1, e.target.files[0])}
                    />
                  </label>
                ))}
              </div>
            </Champ>
          </SousSection>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5">
          <h1 className="font-display text-2xl text-ink">Offre &amp; potentiel</h1>

          <SousSection titre="Spiritueux" icon={IconGlass}>
            <Champ label="Vend des spiritueux ?">
              <ChoiceGroup
                options={[{ value: "oui", label: "Oui" }, { value: "non", label: "Non" }]}
                value={vendSpiritueux === undefined ? undefined : vendSpiritueux ? "oui" : "non"}
                onChange={(v) => setVendSpiritueux(v === "oui")}
              />
            </Champ>
          </SousSection>

          {vendSpiritueux === true && (
            <>
              <SousSection titre="Vins mousseux / Champagnes" icon={IconGlass}>
                <p className="-mt-1 text-xs text-ink-muted">
                  Cochez les marques vendues et indiquez leur prix en rayon.
                </p>
                <BlocBoissons
                  marques={(ref?.marques || []).filter((m) => m.categorie === "MOUSSEUX")}
                  valeurs={boissons}
                  onChangeMarque={(id, v) => setBoissons((prev) => ({ ...prev, [id]: v }))}
                  libres={libresMousseux}
                  onChangeLibre={(i, v) => setLibresMousseux((prev) => prev.map((x, k) => (k === i ? v : x)))}
                />
              </SousSection>

              <SousSection titre="Cocktails RTD" icon={IconGlass}>
                <p className="-mt-1 text-xs text-ink-muted">
                  Cochez les marques vendues et indiquez leur prix en rayon.
                </p>
                <BlocBoissons
                  marques={(ref?.marques || []).filter((m) => m.categorie === "RTD")}
                  valeurs={boissons}
                  onChangeMarque={(id, v) => setBoissons((prev) => ({ ...prev, [id]: v }))}
                  libres={libresRtd}
                  onChangeLibre={(i, v) => setLibresRtd((prev) => prev.map((x, k) => (k === i ? v : x)))}
                />
              </SousSection>
            </>
          )}

          <SousSection titre="Fréquentation & approvisionnement" icon={IconClock}>
            <Champ label="Capacité estimée">
              <ChoiceGroup
                options={[
                  { value: "MOINS_20", label: "Moins de 20 places" },
                  { value: "DE_20_A_50", label: "20 à 50" },
                  { value: "DE_50_A_100", label: "50 à 100" },
                  { value: "PLUS_100", label: "Plus de 100" },
                ]}
                value={capaciteEstimee}
                onChange={setCapaciteEstimee}
              />
            </Champ>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Champ label="Salle climatisée ?">
                <ChoiceGroup
                  options={[{ value: "oui", label: "Oui" }, { value: "non", label: "Non" }]}
                  value={salleClimatisee === undefined ? undefined : salleClimatisee ? "oui" : "non"}
                  onChange={(v) => setSalleClimatisee(v === "oui")}
                />
              </Champ>
              <Champ label="Écran TV disponible ?">
                <ChoiceGroup
                  options={[{ value: "oui", label: "Oui" }, { value: "non", label: "Non" }]}
                  value={ecranTv === undefined ? undefined : ecranTv ? "oui" : "non"}
                  onChange={(v) => setEcranTv(v === "oui")}
                />
              </Champ>
            </div>

            <Champ label="Jours / heures d'affluence">
              <AffluenceGrid value={affluence} onChange={setAffluence} />
            </Champ>

            <Champ label="Fournisseur actuel">
              <MultiChoiceGroup
                options={[
                  { value: "grossiste", label: "Grossiste" },
                  { value: "marche", label: "Marché" },
                  { value: "livraison", label: "Livraison directe" },
                  { value: "autre", label: "Autre" },
                  { value: "neSaitPas", label: "Ne sait pas" },
                ]}
                values={Object.entries(fournisseurs)
                  .filter(([, v]) => v)
                  .map(([k]) => k)}
                onToggle={(k) => setFournisseurs((prev) => ({ ...prev, [k]: !prev[k as keyof typeof prev] }))}
              />
              {fournisseurs.autre && (
                <input
                  className="field-input mt-2"
                  placeholder="Précisez le fournisseur"
                  value={fournisseurAutrePrecision}
                  onChange={(e) => setFournisseurAutrePrecision(e.target.value)}
                />
              )}
            </Champ>
          </SousSection>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-5">
          <h1 className="font-display text-2xl text-ink">Qualification commerciale</h1>

          <SousSection titre="Évaluation" icon={IconCheckCircle}>
            <Champ label="Potentiel estimé">
              <ChoiceGroup
                options={[
                  { value: "FORT", label: "Fort" },
                  { value: "MOYEN", label: "Moyen" },
                  { value: "FAIBLE", label: "Faible" },
                ]}
                value={potentielEstime}
                onChange={setPotentielEstime}
              />
            </Champ>

            <Champ label="Intéressé par une visite commerciale ?">
              <ChoiceGroup
                options={[{ value: "oui", label: "Oui" }, { value: "non", label: "Non" }]}
                value={interesseVisiteCommerciale === undefined ? undefined : interesseVisiteCommerciale ? "oui" : "non"}
                onChange={(v) => setInteresseVisiteCommerciale(v === "oui")}
              />
            </Champ>

          </SousSection>

          <SousSection titre="Suite à donner" icon={IconClipboard}>
            <Champ label="Le client veut passer une commande ?">
              <ChoiceGroup
                options={[{ value: "oui", label: "Oui" }, { value: "non", label: "Non" }]}
                value={veutCommander === undefined ? undefined : veutCommander ? "oui" : "non"}
                onChange={(v) => setVeutCommander(v === "oui")}
              />
            </Champ>

            <Champ label="Observations">
              <textarea
                className="field-input min-h-[100px]"
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
              />
            </Champ>
          </SousSection>
        </section>
      )}

      <div className="mt-8 flex gap-3">
        {step > 1 && (
          <button type="button" className="btn-secondary flex-1" onClick={() => setStep(step - 1)}>
            Retour
          </button>
        )}
        {step < 4 && (
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={!peutAvancer}
            onClick={() => setStep(step + 1)}
          >
            Continuer
          </button>
        )}
        {step === 4 && (
          <button type="button" className="btn-primary flex-1" onClick={soumettre} disabled={envoi}>
            {envoi && <Spinner className="h-4 w-4" />}
            {envoi ? "Enregistrement…" : "Enregistrer la visite"}
          </button>
        )}
      </div>
    </div>
  );
}

const TYPES_ETABLISSEMENT = ["Cave", "Bar", "Lounge", "Snack", "Restaurant / Fast Food", "Hôtel", "Autre"];

/** "du gérant" / "de l'employé" / "du répondant" — pour les libellés dynamiques. */
function articleRepondant(repondant: string | undefined): string {
  switch (repondant) {
    case "GERANT":
      return "du gérant";
    case "EMPLOYE":
      return "de l'employé";
    default:
      return "du répondant";
  }
}

function ContactChamps({
  nomLabel,
  telLabel,
  nom,
  tel,
  onNom,
  onTel,
}: {
  nomLabel: string;
  telLabel: string;
  nom: string;
  tel: string;
  onNom: (v: string) => void;
  onTel: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Champ label={nomLabel}>
        <input className="field-input" autoComplete="off" value={nom} onChange={(e) => onNom(e.target.value)} />
      </Champ>
      <Champ label={telLabel}>
        <input className="field-input" inputMode="tel" autoComplete="off" value={tel} onChange={(e) => onTel(e.target.value)} />
      </Champ>
    </div>
  );
}

function Ligne({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm font-medium text-ink">{valeur}</span>
    </div>
  );
}

function SousSection({
  titre,
  icon: Icon,
  children,
}: {
  titre: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="field-card space-y-4">
      <p className="section-eyebrow">
        <Icon className="h-4 w-4" />
        {titre}
      </p>
      {children}
    </div>
  );
}

function Champ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="field-label">
        {label} {required && <span className="text-brass">*</span>}
      </label>
      {children}
    </div>
  );
}
