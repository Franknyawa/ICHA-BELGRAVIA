"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconStorefront, IconPhone, IconArrowRight, IconUsers } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { nombreFr } from "@/lib/format";

type Client = {
  id: string;
  nomEtablissement: string;
  nomVendeur: string | null;
  telVendeur: string | null;
  nomPatron: string | null;
  telPatron: string | null;
  quartier: string | null;
  ville: { nom: string } | null;
  type: { nom: string } | null;
  commandes: number;
  facture: number;
  encaisse: number;
  reste: number;
  derniereCommande: string;
};

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" });

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [q, setQ] = useState("");
  const [seulementDus, setSeulementDus] = useState(false);

  useEffect(() => {
    fetch("/api/clients")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erreur de chargement.");
        setClients(d.clients);
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false));
  }, []);

  const filtres = useMemo(() => {
    const t = q.trim().toLowerCase();
    return clients.filter(
      (c) =>
        (!seulementDus || c.reste > 0) &&
        (!t || [c.nomEtablissement, c.nomVendeur, c.nomPatron, c.quartier, c.ville?.nom].some((v) => v?.toLowerCase().includes(t)))
    );
  }, [clients, q, seulementDus]);

  const totalReste = filtres.reduce((s, c) => s + c.reste, 0);

  return (
    <div className="w-full">
      <h1 className="mb-1 flex items-center gap-2 font-display text-2xl text-ink">
        <IconUsers className="h-5 w-5 text-brass" />
        Clients
      </h1>
      <p className="mb-4 text-sm text-ink-muted">Points de vente ayant passé au moins une commande.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="field-input max-w-xs" placeholder="Rechercher un client, quartier, ville…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm font-medium text-ink-muted">
          <input type="checkbox" checked={seulementDus} onChange={(e) => setSeulementDus(e.target.checked)} />
          Avec un reste à encaisser
        </label>
        <p className="ml-auto text-sm font-semibold text-ink-muted">
          {filtres.length} client{filtres.length > 1 ? "s" : ""} · Reste dû :{" "}
          <span className="montant text-base text-danger">{nombreFr(totalReste)}</span> FCFA
        </p>
      </div>

      {erreur && <p className="mb-3 text-sm text-danger">{erreur}</p>}
      {chargement && (
        <div className="flex justify-center py-12">
          <Spinner className="h-5 w-5" />
        </div>
      )}

      <div className="space-y-2">
        {filtres.map((c) => {
          const tel = c.telVendeur || c.telPatron;
          return (
            <Link key={c.id} href={`/clients/${c.id}`} className="field-card flex flex-wrap items-center gap-x-4 gap-y-2 !py-3 transition-colors hover:border-brass/50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
                <IconStorefront className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-menu text-base font-extrabold text-ink">{c.nomEtablissement}</p>
                <p className="truncate text-xs font-medium text-ink-muted">
                  {[c.type?.nom, c.ville?.nom, c.quartier].filter(Boolean).join(" · ") || "—"}
                  {tel && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <IconPhone className="h-3 w-3" />
                      {tel}
                    </span>
                  )}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-x-5 text-right text-xs font-semibold text-ink-muted">
                <span>
                  Commandes
                  <span className="montant block text-base text-ink">{c.commandes}</span>
                </span>
                <span>
                  Facturé
                  <span className="montant block text-base text-ink">{nombreFr(c.facture)}</span>
                </span>
                <span>
                  Reste
                  <span className={`montant block text-base ${c.reste > 0 ? "text-danger" : "text-ok"}`}>{nombreFr(c.reste)}</span>
                </span>
              </div>
              <span className="hidden text-xs text-ink-muted sm:block">Dernière : {dateFr(c.derniereCommande)}</span>
              <IconArrowRight className="h-4 w-4 text-ink-muted" />
            </Link>
          );
        })}
        {!chargement && !erreur && filtres.length === 0 && (
          <div className="field-card py-12 text-center text-sm text-ink-muted">Aucun client pour ce filtre.</div>
        )}
      </div>
    </div>
  );
}
