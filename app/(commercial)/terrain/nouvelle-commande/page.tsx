"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuid } from "uuid";
import { IconStorefront, IconGlass, IconPlus, IconTrash, IconClipboard } from "@/components/icons";
import { enqueuerCommande } from "@/lib/offlineQueue";
import { envoyerCommande } from "@/lib/envoyerCommande";

type Produit = { id: string; nom: string; prixUnitaire: string };
type Client = {
  id: string;
  nomEtablissement: string;
  nomVendeur: string | null;
  telVendeur: string | null;
  quartier: string | null;
  ville: string | null;
};
type Ligne = { id: string; produitId: string; libelleLibre: string; quantite: number; prixUnitaire: number };

function ligneVide(): Ligne {
  return { id: uuid(), produitId: "", libelleLibre: "", quantite: 1, prixUnitaire: 0 };
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
  const [client, setClient] = useState<Client | null>(null);
  const [chargementClient, setChargementClient] = useState(!!pointVenteIdInitial);
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Client[]>([]);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [lignes, setLignes] = useState<Ligne[]>([ligneVide()]);
  const [observations, setObservations] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageInfo, setMessageInfo] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/referentiels")
      .then((r) => r.json())
      .then((data) => setProduits(data.produits || []));
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

  function ajouterLigne() {
    setLignes((prev) => [...prev, ligneVide()]);
  }

  function retirerLigne(id: string) {
    setLignes((prev) => prev.filter((l) => l.id !== id));
  }

  function modifierLigne(id: string, changements: Partial<Ligne>) {
    setLignes((prev) => prev.map((l) => (l.id === id ? { ...l, ...changements } : l)));
  }

  function choisirProduit(id: string, produitId: string) {
    const produit = produits.find((p) => p.id === produitId);
    modifierLigne(id, {
      produitId,
      libelleLibre: "",
      prixUnitaire: produit ? Number(produit.prixUnitaire) : 0,
    });
  }

  const total = useMemo(
    () => lignes.reduce((s, l) => s + (l.quantite || 0) * (l.prixUnitaire || 0), 0),
    [lignes]
  );

  const peutEnregistrer = !!client && lignes.some((l) => l.quantite > 0 && (l.produitId || l.libelleLibre.trim()));

  async function soumettre() {
    if (!client) return;
    setEnvoi(true);
    setErreur(null);
    setMessageInfo(null);

    const payload = {
      uuidClient: uuidCommande,
      pointVenteId: client.id,
      observations,
      lignes: lignes
        .filter((l) => l.quantite > 0 && (l.produitId || l.libelleLibre.trim()))
        .map((l) => ({
          produitId: l.produitId || undefined,
          libelleLibre: l.produitId ? undefined : l.libelleLibre.trim(),
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
        })),
    };

    try {
      await envoyerCommande(payload);
      router.push("/terrain");
    } catch {
      try {
        await enqueuerCommande({ id: uuidCommande, payload, createdAt: Date.now() });
        setMessageInfo(
          "Pas de connexion : la commande a été enregistrée sur l'appareil et sera envoyée automatiquement dès le retour du réseau."
        );
        setTimeout(() => router.push("/terrain"), 1800);
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
            <input
              className="field-input"
              placeholder="Rechercher un point de vente déjà recensé…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
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
                      <span className="font-medium text-ink">{r.nomEtablissement}</span>
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

      {/* Section Produits */}
      <div className="field-card space-y-3">
        <p className="section-eyebrow">
          <IconGlass className="h-4 w-4" />
          Produits
        </p>

        <div className="space-y-3">
          {lignes.map((ligne) => (
            <div key={ligne.id} className="rounded-md border border-line bg-bg-elevated p-3">
              <div className="mb-2 flex items-center gap-2">
                <select
                  className="field-input"
                  value={ligne.produitId}
                  onChange={(e) => choisirProduit(ligne.id, e.target.value)}
                >
                  <option value="">— Produit libre —</option>
                  {produits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
                {lignes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => retirerLigne(ligne.id)}
                    className="shrink-0 rounded-md p-2.5 text-ink-muted hover:text-danger"
                    aria-label="Retirer cette ligne"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                )}
              </div>

              {!ligne.produitId && (
                <input
                  className="field-input mb-2"
                  placeholder="Nom du produit"
                  value={ligne.libelleLibre}
                  onChange={(e) => modifierLigne(ligne.id, { libelleLibre: e.target.value })}
                />
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="field-label">Quantité</label>
                  <input
                    type="number"
                    min={1}
                    className="field-input"
                    value={ligne.quantite}
                    onChange={(e) => modifierLigne(ligne.id, { quantite: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div>
                  <label className="field-label">Prix unitaire</label>
                  <input
                    type="number"
                    min={0}
                    className="field-input"
                    value={ligne.prixUnitaire}
                    onChange={(e) => modifierLigne(ligne.id, { prixUnitaire: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <p className="mt-2 text-right text-sm text-ink-muted">
                Sous-total : <span className="font-medium text-ink">{(ligne.quantite * ligne.prixUnitaire).toLocaleString("fr-FR")}</span>
              </p>
            </div>
          ))}
        </div>

        <button type="button" onClick={ajouterLigne} className="btn-secondary w-full">
          <IconPlus className="h-4 w-4" />
          Ajouter un produit
        </button>

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm font-medium text-ink-muted">Total général</span>
          <span className="font-display text-2xl text-ink">{total.toLocaleString("fr-FR")}</span>
        </div>
      </div>

      <div className="field-card">
        <label className="field-label">Observations</label>
        <textarea
          className="field-input min-h-[80px]"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
        />
      </div>

      <button type="button" className="btn-primary w-full py-4" onClick={soumettre} disabled={!peutEnregistrer || envoi}>
        <IconClipboard className="h-4 w-4" />
        {envoi ? "Enregistrement…" : "Enregistrer la commande"}
      </button>
    </div>
  );
}
