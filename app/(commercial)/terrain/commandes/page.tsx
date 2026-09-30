"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconReceipt } from "@/components/icons";
import FactureButton from "@/components/FactureButton";
import { libelleModePaiement } from "@/lib/pricing";

type Ligne = { id: string; quantite: number; prixUnitaire: string; sousTotal: string; produit: { nom: string } | null };
type Commande = {
  id: string;
  createdAt: string;
  statut: "NON_TRAITEE" | "EN_COURS_LIVRAISON" | "LIVREE";
  montantTotal: string;
  modePaiement: string;
  montantRecu: string;
  resteAPayer: string;
  pointVente: { nomEtablissement: string; quartier: string | null; ville: { nom: string } | null };
  commercial: { nom: string; prenom: string };
  lignes: Ligne[];
};

const STATUT_LABEL: Record<string, string> = {
  NON_TRAITEE: "Non traitée",
  EN_COURS_LIVRAISON: "En cours de livraison",
  LIVREE: "Livrée",
};
const STATUT_STYLE: Record<string, string> = {
  NON_TRAITEE: "text-ink-muted",
  EN_COURS_LIVRAISON: "text-brass",
  LIVREE: "text-ok",
};

export default function MesCommandesPage() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    fetch("/api/commandes")
      .then((r) => r.json())
      .then((d) => setCommandes(d.items || []))
      .finally(() => setChargement(false));
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/terrain" className="text-sm text-ink-muted hover:text-brass">
        ← Retour
      </Link>
      <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
        <IconReceipt className="h-5 w-5 text-brass" />
        Mes commandes
      </h1>

      {chargement && <p className="text-sm text-ink-muted">Chargement…</p>}

      <div className="space-y-3">
        {commandes.map((c) => (
          <div key={c.id} className="field-card">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-medium text-ink">{c.pointVente.nomEtablissement}</p>
                <p className="text-xs text-ink-muted">
                  {c.pointVente.ville?.nom} ·{" "}
                  {new Date(c.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                  {libelleModePaiement(c.modePaiement)}
                </p>
                <p className={`mt-1 text-xs font-semibold ${STATUT_STYLE[c.statut]}`}>{STATUT_LABEL[c.statut]}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="font-display text-lg text-ink">{Number(c.montantTotal).toLocaleString("fr-FR")}</span>
                <FactureButton commande={c} />
              </div>
            </div>
            {Number(c.resteAPayer) > 0 && (
              <p className="text-sm font-medium text-danger">
                Reste à payer : {Number(c.resteAPayer).toLocaleString("fr-FR")} FCFA
              </p>
            )}
          </div>
        ))}
        {!chargement && commandes.length === 0 && (
          <p className="field-card text-center text-sm text-ink-muted">Aucune commande enregistrée.</p>
        )}
      </div>
    </div>
  );
}
