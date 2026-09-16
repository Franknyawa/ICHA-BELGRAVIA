"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import StepIndicator from "@/components/form/StepIndicator";
import { ChoiceGroup, MultiChoiceGroup } from "@/components/form/ChoiceGroup";
import { resolveVilleDepuisCoordonnees } from "@/lib/reverseGeocode";
import { enqueuerVisite } from "@/lib/offlineQueue";
import { envoyerVisite } from "@/lib/envoyerVisite";
import { IconStorefront, IconPhone, IconPin, IconCamera, IconGlass, IconClock, IconCheckCircle, IconClipboard } from "@/components/icons";

type Referentiels = {
  villes: { id: string; nom: string }[];
  types: { id: string; nom: string }[];
  marques: { id: string; nom: string }[];
};

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const CRENEAUX = [
  { value: "MATIN", label: "Matin" },
  { value: "APRES_MIDI", label: "Après-midi" },
  { value: "SOIR", label: "Soir" },
];

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
  const [nomVendeur, setNomVendeur] = useState("");
  const [telVendeur, setTelVendeur] = useState("");
  const [telPatron, setTelPatron] = useState("");
  const [villeId, setVilleId] = useState("");
  const [villeResolue, setVilleResolue] = useState<string | null>(null);
  const [quartier, setQuartier] = useState("");
  const [repereQuartier, setRepereQuartier] = useState("");
  const [typeId, setTypeId] = useState("");
  const [typeAutrePrecision, setTypeAutrePrecision] = useState("");
  const [statut, setStatut] = useState<"OUVERT" | "FERME_TEMPORAIREMENT" | "EN_TRAVAUX">("OUVERT");
  const [gps, setGps] = useState<{ lat: number; lng: number; precision: number } | null>(null);
  const [gpsEnCours, setGpsEnCours] = useState(false);
  const [photos, setPhotos] = useState<[PhotoSlot, PhotoSlot]>([
    { uuidClient: uuid(), preview: null, url: null, enCours: false },
    { uuidClient: uuid(), preview: null, url: null, enCours: false },
  ]);

  // Section 3
  const [vendSpiritueux, setVendSpiritueux] = useState<boolean | undefined>();
  const [marquesCoches, setMarquesCoches] = useState<string[]>([]);
  const [marquesLibres, setMarquesLibres] = useState(["", "", ""]);
  const [proposeCocktails, setProposeCocktails] = useState<"OUI" | "NON" | "INTERESSE">();
  const [capaciteEstimee, setCapaciteEstimee] = useState<string>();
  const [affluence, setAffluence] = useState<Record<string, string[]>>({});
  const [fournisseurs, setFournisseurs] = useState({
    grossiste: false,
    marche: false,
    livraison: false,
    neSaitPas: false,
  });

  // Section 4
  const [potentielEstime, setPotentielEstime] = useState<string>();
  const [interesseVisiteCommerciale, setInteresseVisiteCommerciale] = useState<boolean>();
  const [observations, setObservations] = useState("");
  const [repondant, setRepondant] = useState<string>();
  const [repondantAutrePrecision, setRepondantAutrePrecision] = useState("");
  const [veutCommander, setVeutCommander] = useState<boolean>();

  useEffect(() => {
    fetch("/api/referentiels").then((r) => r.json()).then(setRef);
    fetch("/api/me").then((r) => r.json()).then(setAgent);
  }, []);

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
        const ville = await resolveVilleDepuisCoordonnees(latitude, longitude);
        setVilleResolue(ville);
        if (ville && ref) {
          const match = ref.villes.find((v) => v.nom.toLowerCase() === ville.toLowerCase());
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
      const dataUrl = reader.result as string;
      setPhotos((prev) => {
        const next = [...prev] as [PhotoSlot, PhotoSlot];
        next[index] = { ...next[index], preview: dataUrl, enCours: true };
        return next;
      });
      // Upload optimiste immédiat : accélère l'envoi final si le réseau est
      // disponible. En cas d'échec (hors-ligne), la photo reste en data URL
      // dans l'état local et sera uploadée au moment de la synchronisation
      // (voir lib/envoyerVisite.ts) — la capture elle-même n'est jamais bloquée.
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

  function toggleCreneau(jour: string, creneau: string) {
    setAffluence((prev) => {
      const courants = prev[jour] || [];
      const next = courants.includes(creneau)
        ? courants.filter((c) => c !== creneau)
        : [...courants, creneau];
      return { ...prev, [jour]: next };
    });
  }

  const peutAvancer = useMemo(() => {
    if (step === 2) return nomEtablissement.trim().length > 0;
    return true;
  }, [step, nomEtablissement]);

  async function soumettre() {
    setEnvoi(true);
    setErreur(null);
    setMessageInfo(null);

    const affluenceArray = Object.entries(affluence)
      .filter(([, creneaux]) => creneaux.length > 0)
      .map(([jour, creneaux]) => ({ jour, creneaux }));

    const marquesPresentes = [
      ...marquesCoches.map((marqueId) => ({ marqueId })),
      ...marquesLibres.filter((m) => m.trim()).map((libelleLibre) => ({ libelleLibre })),
    ];

    const payload = {
      uuidClient: uuidVisite,
      dateVisite: maintenant.toISOString(),
      pointVente: {
        nomEtablissement,
        nomVendeur,
        telVendeur,
        telPatron,
        villeId: villeId || null,
        quartier,
        repereQuartier,
        typeId: typeId || null,
        typeAutrePrecision,
        statut,
        latitude: gps?.lat,
        longitude: gps?.lng,
        precisionGps: gps?.precision,
      },
      offrePotentiel: {
        vendSpiritueux,
        proposeCocktails,
        capaciteEstimee,
        affluence: affluenceArray,
        fournisseurGrossiste: fournisseurs.grossiste,
        fournisseurMarche: fournisseurs.marche,
        fournisseurLivraison: fournisseurs.livraison,
        fournisseurNeSaitPas: fournisseurs.neSaitPas,
      },
      qualification: {
        potentielEstime,
        interesseVisiteCommerciale,
        observations,
        repondant,
        repondantAutrePrecision,
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
      await envoyerVisite(payload, photosPayload);
      router.push("/terrain");
    } catch {
      // Réseau indisponible (ou instable) : la visite n'est pas perdue —
      // elle est conservée localement et sera synchronisée automatiquement
      // dès que la connexion revient (voir components/SyncBanner.tsx).
      try {
        await enqueuerVisite({ id: uuidVisite, payload, photos: photosPayload, createdAt: Date.now() });
        setMessageInfo("Pas de connexion : la visite a été enregistrée sur l'appareil et sera envoyée automatiquement dès le retour du réseau.");
        setTimeout(() => router.push("/terrain"), 1800);
      } catch {
        setErreur("Échec de l'enregistrement, y compris en local. Réessayez.");
      }
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <StepIndicator step={step} />

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
            <Champ label="Type d'établissement">
              <ChoiceGroup
                options={[
                  { value: "Cave", label: "Cave" },
                  { value: "Bar", label: "Bar" },
                  { value: "Lounge", label: "Lounge" },
                  { value: "Snack", label: "Snack" },
                  { value: "Restaurant / Fast Food", label: "Restaurant / Fast Food" },
                  { value: "Hôtel", label: "Hôtel" },
                  { value: "Autre", label: "Autre" },
                ]}
                value={ref?.types.find((t) => t.id === typeId)?.nom}
                onChange={(nom) => {
                  const match = ref?.types.find((t) => t.nom === nom);
                  setTypeId(match?.id || `libre:${nom}`);
                }}
              />
              {(typeId === "libre:Autre" || ref?.types.find((t) => t.id === typeId)?.nom === "Autre") && (
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
            <Champ label="Nom du vendeur">
              <input className="field-input" value={nomVendeur} onChange={(e) => setNomVendeur(e.target.value)} />
            </Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Tél. vendeur">
                <input className="field-input" inputMode="tel" value={telVendeur} onChange={(e) => setTelVendeur(e.target.value)} />
              </Champ>
              <Champ label="Tél. patron (si différent)">
                <input className="field-input" inputMode="tel" value={telPatron} onChange={(e) => setTelPatron(e.target.value)} />
              </Champ>
            </div>
          </SousSection>

          <SousSection titre="Localisation" icon={IconPin}>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Ville">
                <select className="field-input" value={villeId} onChange={(e) => setVilleId(e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {ref?.villes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nom}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ label="Quartier">
                <input className="field-input" value={quartier} onChange={(e) => setQuartier(e.target.value)} />
              </Champ>
            </div>
            {villeResolue && (
              <p className="-mt-2 text-xs text-ink-muted">Position détectée près de : {villeResolue}</p>
            )}
            <Champ label="Repère du quartier">
              <input
                className="field-input"
                placeholder="Ex. en face de la pharmacie…"
                value={repereQuartier}
                onChange={(e) => setRepereQuartier(e.target.value)}
              />
            </Champ>
            <Champ label="Localisation GPS">
              <button type="button" className="btn-secondary w-full" onClick={capturerPosition} disabled={gpsEnCours}>
                {gpsEnCours ? "Localisation…" : gps ? "Position capturée — recapturer" : "Capturer la position"}
              </button>
              {gps && (
                <p className="mt-1 text-xs text-ink-muted">
                  {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} (±{Math.round(gps.precision)} m)
                </p>
              )}
            </Champ>
          </SousSection>

          <SousSection titre="Devanture & statut" icon={IconCamera}>
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

            <Champ label="Statut">
              <ChoiceGroup
                options={[
                  { value: "OUVERT", label: "Ouvert" },
                  { value: "FERME_TEMPORAIREMENT", label: "Fermé temporairement" },
                  { value: "EN_TRAVAUX", label: "En travaux" },
                ]}
                value={statut}
                onChange={(v) => setStatut(v as typeof statut)}
              />
            </Champ>
          </SousSection>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5">
          <h1 className="font-display text-2xl text-ink">Offre &amp; potentiel</h1>

          <SousSection titre="Spiritueux & cocktails" icon={IconGlass}>
            <Champ label="Vend des spiritueux ?">
              <ChoiceGroup
                options={[{ value: "oui", label: "Oui" }, { value: "non", label: "Non" }]}
                value={vendSpiritueux === undefined ? undefined : vendSpiritueux ? "oui" : "non"}
                onChange={(v) => setVendSpiritueux(v === "oui")}
              />
            </Champ>

            <Champ label="Marques présentes">
              <MultiChoiceGroup
                options={ref?.marques.map((m) => ({ value: m.id, label: m.nom })) || []}
                values={marquesCoches}
                onToggle={(id) =>
                  setMarquesCoches((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                }
              />
              <div className="mt-2 grid grid-cols-3 gap-2">
                {marquesLibres.map((val, i) => (
                  <input
                    key={i}
                    className="field-input"
                    placeholder={`Autre ${i + 1}`}
                    value={val}
                    onChange={(e) => {
                      const next = [...marquesLibres];
                      next[i] = e.target.value;
                      setMarquesLibres(next);
                    }}
                  />
                ))}
              </div>
            </Champ>

            <Champ label="Propose des cocktails ?">
              <ChoiceGroup
                options={[
                  { value: "OUI", label: "Oui" },
                  { value: "NON", label: "Non" },
                  { value: "INTERESSE", label: "Intéressé" },
                ]}
                value={proposeCocktails}
                onChange={(v) => setProposeCocktails(v as typeof proposeCocktails)}
              />
            </Champ>
          </SousSection>

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

            <Champ label="Jours / heures d'affluence">
              <div className="space-y-2">
                {JOURS.map((jour) => (
                  <div key={jour} className="rounded-md border border-line bg-bg-elevated p-3">
                    <p className="mb-2 text-sm font-medium text-ink">{jour}</p>
                    <MultiChoiceGroup
                      options={CRENEAUX}
                      values={affluence[jour] || []}
                      onToggle={(c) => toggleCreneau(jour, c)}
                    />
                  </div>
                ))}
              </div>
            </Champ>

            <Champ label="Fournisseur actuel">
              <MultiChoiceGroup
                options={[
                  { value: "grossiste", label: "Grossiste" },
                  { value: "marche", label: "Marché" },
                  { value: "livraison", label: "Livraison directe" },
                  { value: "neSaitPas", label: "Ne sait pas" },
                ]}
                values={Object.entries(fournisseurs)
                  .filter(([, v]) => v)
                  .map(([k]) => k)}
                onToggle={(k) => setFournisseurs((prev) => ({ ...prev, [k]: !prev[k as keyof typeof prev] }))}
              />
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

            <Champ label="Répondant">
              <ChoiceGroup
                options={[
                  { value: "GERANT_PATRON", label: "Gérant / patron" },
                  { value: "EMPLOYE", label: "Employé" },
                  { value: "AUTRE", label: "Autre" },
                ]}
                value={repondant}
                onChange={setRepondant}
              />
              {repondant === "AUTRE" && (
                <input
                  className="field-input mt-2"
                  placeholder="Précisez"
                  value={repondantAutrePrecision}
                  onChange={(e) => setRepondantAutrePrecision(e.target.value)}
                />
              )}
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
            {envoi ? "Enregistrement…" : "Enregistrer la visite"}
          </button>
        )}
      </div>
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
