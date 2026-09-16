"use client";

import { useEffect, useState } from "react";
import { IconReceipt } from "@/components/icons";

type Ligne = { id: string; quantite: number; prixUnitaire: string; produit: { nom: string } | null; libelleLibre: string | null };
type Commande = {
  id: string;
  dateCommande: string;
  montantTotal: string;
  observations: string | null;
  pointVente: { nomEtablissement: string; ville: { nom: string } | null };
  commercial: { prenom: string; nom: string };
  lignes: Ligne[];
};

export default function CommandesPage() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [total, setTotal] = useState(0);
  const [nouvelles, setNouvelles] = useState(0);
  const [chargement, setChargement] = useState(true);

  async function charger() {
    setChargement(true);
    const res = await fetch("/api/commandes");
    const data = await res.json();
    setCommandes(data.items || []);
    setTotal(data.total || 0);
    setChargement(false);
  }

  useEffect(() => {
    charger();
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/commandes/stream");
    source.addEventListener("nouvelle-commande", () => setNouvelles((n) => n + 1));
    return () => source.close();
  }, []);

  function rafraichir() {
    setNouvelles(0);
    charger();
  }

  const montantTotalGeneral = commandes.reduce((s, c) => s + Number(c.montantTotal), 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
            <IconReceipt className="h-5 w-5 text-brass" />
            Commandes
          </h1>
          <p className="text-sm text-ink-muted">{total} commande(s) enregistrée(s)</p>
        </div>
        {nouvelles > 0 && (
          <button onClick={rafraichir} className="btn-primary">
            {nouvelles} nouvelle{nouvelles > 1 ? "s" : ""} commande{nouvelles > 1 ? "s" : ""} — actualiser
          </button>
        )}
      </div>

      {!chargement && commandes.length > 0 && (
        <p className="mb-4 text-sm text-ink-muted">
          Montant total (page courante) :{" "}
          <span className="font-semibold text-ink">{montantTotalGeneral.toLocaleString("fr-FR")}</span>
        </p>
      )}

      <div className="space-y-3">
        {commandes.map((c) => (
          <div key={c.id} className="field-card">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-medium text-ink">{c.pointVente.nomEtablissement}</p>
                <p className="text-xs text-ink-muted">
                  {c.pointVente.ville?.nom} · {c.commercial.prenom} {c.commercial.nom} ·{" "}
                  {new Date(c.dateCommande).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
              <span className="font-display text-xl text-ink">{Number(c.montantTotal).toLocaleString("fr-FR")}</span>
            </div>
            <ul className="space-y-1 border-t border-line pt-2 text-sm">
              {c.lignes.map((l) => (
                <li key={l.id} className="flex justify-between text-ink-muted">
                  <span>
                    {l.quantite} × {l.produit?.nom || l.libelleLibre}
                  </span>
                  <span>{(l.quantite * Number(l.prixUnitaire)).toLocaleString("fr-FR")}</span>
                </li>
              ))}
            </ul>
            {c.observations && <p className="mt-2 text-sm text-ink-muted">Note : {c.observations}</p>}
          </div>
        ))}
        {!chargement && commandes.length === 0 && (
          <p className="field-card text-center text-sm text-ink-muted">Aucune commande enregistrée pour le moment.</p>
        )}
      </div>
    </div>
  );
}
