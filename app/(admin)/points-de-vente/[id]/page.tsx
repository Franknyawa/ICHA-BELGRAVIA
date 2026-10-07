"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { libelleTypes } from "@/lib/typesEtablissement";
import { IconStorefront, IconPhone, IconPin, IconReceipt, IconClipboard, IconCamera } from "@/components/icons";
import { Spinner, ChargementPage } from "@/components/Spinner";

type Ligne = { id: string; quantite: number; prixUnitaire: string; produit: { nom: string } | null };
type Commande = {
  id: string;
  createdAt: string;
  montantTotal: string;
  modePaiement: string;
  resteAPayer: string;
  commercial: { nom: string; prenom: string };
  lignes: Ligne[];
};
type Visite = {
  id: string;
  dateVisite: string;
  potentielEstime: string | null;
  veutCommander: boolean | null;
  observations: string | null;
  commercial: { nom: string; prenom: string };
};
type Photo = { id: string; url: string; createdAt: string };
type Fiche = {
  id: string;
  nomEtablissement: string;
  nomVendeur: string | null;
  telVendeur: string | null;
  nomPatron: string | null;
  telPatron: string | null;
  quartier: string | null;
  repereQuartier: string | null;
  statut: string;
  latitude: string | null;
  longitude: string | null;
  ville: { nom: string } | null;
  type: { nom: string } | null;
  typesLies?: { type: { nom: string } }[];
  typeAutrePrecision?: string | null;
  createdBy: { nom: string; prenom: string };
  createdAt: string;
  visites: Visite[];
  commandes: Commande[];
  photos: Photo[];
};

const MODE_LABEL: Record<string, string> = {
  ESPECES: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  CREDIT_PARTIEL: "Crédit partiel",
  CREDIT_TOTAL: "Crédit total",
};

export default function FichePointVentePage() {
  const { id } = useParams<{ id: string }>();
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [chargement, setChargement] = useState(true);
  const [photoAgrandie, setPhotoAgrandie] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/points-vente/${id}`)
      .then((r) => r.json())
      .then((d) => setFiche(d.pointVente))
      .finally(() => setChargement(false));
  }, [id]);

  if (chargement) return <ChargementPage label="Chargement de la fiche…" />;
  if (!fiche) return <p className="text-sm text-danger">Fiche introuvable.</p>;

  const montantTotalCommandes = fiche.commandes.reduce((s, c) => s + Number(c.montantTotal), 0);
  const resteAPayerTotal = fiche.commandes.reduce((s, c) => s + Number(c.resteAPayer), 0);

  return (
    <div className="max-w-4xl">
      <Link href="/points-de-vente" className="mb-3 inline-block text-sm text-ink-muted hover:text-brass">
        ← Tous les points de vente
      </Link>

      <div className="field-card mb-5">
        <h1 className="mb-1 flex items-center gap-2 font-display text-2xl text-ink">
          <IconStorefront className="h-5 w-5 text-brass" />
          {fiche.nomEtablissement}
        </h1>
        <p className="mb-4 text-sm text-ink-muted">
          {libelleTypes(fiche) === "—" ? "Type non renseigné" : libelleTypes(fiche)} · {fiche.ville?.nom || "Ville non renseignée"}
          {fiche.quartier ? ` · ${fiche.quartier}` : ""}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-bg-elevated p-3">
            <p className="section-eyebrow mb-1">
              <IconClipboard className="h-4 w-4" />
              Interlocuteur
            </p>
            <p className="text-sm text-ink">{fiche.nomVendeur || "Non renseigné"}</p>
            {fiche.telVendeur && <p className="text-sm text-ink-muted">Contact : {fiche.telVendeur}</p>}
            {(fiche.nomPatron || fiche.telPatron) && (
              <p className="text-sm text-ink-muted">
                Patron : {[fiche.nomPatron, fiche.telPatron].filter(Boolean).join(" — ")}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-bg-elevated p-3">
            <p className="section-eyebrow mb-1">
              <IconPin className="h-4 w-4" />
              Localisation
            </p>
            <p className="text-sm text-ink">{fiche.repereQuartier || "Repère non renseigné"}</p>
            {fiche.latitude && fiche.longitude && (
              <a
                href={`https://www.google.com/maps?q=${fiche.latitude},${fiche.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brass hover:underline"
              >
                Voir sur la carte
              </a>
            )}
          </div>
        </div>

        <p className="mt-3 text-xs text-ink-muted">
          Recensé par {fiche.createdBy.prenom} {fiche.createdBy.nom} le{" "}
          {new Date(fiche.createdAt).toLocaleDateString("fr-FR")}
        </p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="field-card text-center">
          <p className="text-2xl font-display text-ink">{fiche.visites.length}</p>
          <p className="text-xs text-ink-muted">Visite(s)</p>
        </div>
        <div className="field-card text-center">
          <p className="text-2xl font-display text-ink">{montantTotalCommandes.toLocaleString("fr-FR")}</p>
          <p className="text-xs text-ink-muted">Total commandé (FCFA)</p>
        </div>
        <div className="field-card text-center">
          <p className={`text-2xl font-display ${resteAPayerTotal > 0 ? "text-danger" : "text-ok"}`}>
            {resteAPayerTotal.toLocaleString("fr-FR")}
          </p>
          <p className="text-xs text-ink-muted">Reste à payer (FCFA)</p>
        </div>
      </div>

      <div className="mb-5">
        <h2 className="mb-2 flex items-center gap-2 font-display text-lg text-ink">
          <IconCamera className="h-4 w-4 text-brass" />
          Photos ({fiche.photos.length})
        </h2>
        {fiche.photos.length === 0 ? (
          <p className="field-card text-center text-sm text-ink-muted">Aucune photo pour ce point de vente.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {fiche.photos.map((p) => (
              <button
                key={p.id}
                onClick={() => setPhotoAgrandie(p.url)}
                className="group aspect-square overflow-hidden rounded-lg border border-line bg-bg-elevated"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt="Photo terrain"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    e.currentTarget.parentElement?.insertAdjacentHTML(
                      "beforeend",
                      '<span class="flex h-full items-center justify-center p-1 text-center text-[10px] text-danger">Image indisponible</span>'
                    );
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-5">
        <h2 className="mb-2 flex items-center gap-2 font-display text-lg text-ink">
          <IconReceipt className="h-4 w-4 text-brass" />
          Commandes ({fiche.commandes.length})
        </h2>
        <div className="space-y-2">
          {fiche.commandes.map((c) => (
            <div key={c.id} className="field-card">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm text-ink-muted">
                  {new Date(c.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                  {c.commercial.prenom} {c.commercial.nom} · {MODE_LABEL[c.modePaiement] || c.modePaiement}
                </p>
                <span className="font-display text-lg text-ink">{Number(c.montantTotal).toLocaleString("fr-FR")}</span>
              </div>
              <p className="text-xs text-ink-muted">
                {c.lignes.map((l) => `${l.quantite}× ${l.produit?.nom}`).join(" · ")}
              </p>
              {Number(c.resteAPayer) > 0 && (
                <p className="mt-1 text-xs font-medium text-danger">
                  Reste à payer : {Number(c.resteAPayer).toLocaleString("fr-FR")} FCFA
                </p>
              )}
            </div>
          ))}
          {fiche.commandes.length === 0 && (
            <p className="field-card text-center text-sm text-ink-muted">Aucune commande pour ce point de vente.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 font-display text-lg text-ink">
          <IconPhone className="h-4 w-4 text-brass" />
          Historique des visites ({fiche.visites.length})
        </h2>
        <div className="space-y-2">
          {fiche.visites.map((v) => (
            <div key={v.id} className="field-card">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm text-ink-muted">
                  {new Date(v.dateVisite).toLocaleDateString("fr-FR")} · {v.commercial.prenom} {v.commercial.nom}
                </p>
                <span className="text-xs font-medium text-ink-muted">
                  Potentiel : {v.potentielEstime || "—"} · Veut commander :{" "}
                  {v.veutCommander === null ? "—" : v.veutCommander ? "Oui" : "Non"}
                </span>
              </div>
              {v.observations && <p className="text-sm text-ink-muted">{v.observations}</p>}
            </div>
          ))}
          {fiche.visites.length === 0 && (
            <p className="field-card text-center text-sm text-ink-muted">Aucune visite enregistrée.</p>
          )}
        </div>
      </div>

      {photoAgrandie && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPhotoAgrandie(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoAgrandie} alt="Photo terrain agrandie" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
