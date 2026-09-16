"use client";

import { useEffect, useState } from "react";
import { IconPlus, IconUsers } from "@/components/icons";

type Commercial = {
  id: string;
  identifiant: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  actif: boolean;
};

export default function UtilisateursPage() {
  const [users, setUsers] = useState<Commercial[]>([]);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [champs, setChamps] = useState({ identifiant: "", motDePasse: "", nom: "", prenom: "", telephone: "" });
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    const res = await fetch("/api/utilisateurs");
    const data = await res.json();
    setUsers(data.users || []);
  }

  useEffect(() => {
    charger();
  }, []);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const res = await fetch("/api/utilisateurs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(champs),
    });
    setEnCours(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error || "Erreur lors de la création.");
      return;
    }
    setChamps({ identifiant: "", motDePasse: "", nom: "", prenom: "", telephone: "" });
    setFormulaireOuvert(false);
    charger();
  }

  async function toggleActif(u: Commercial) {
    await fetch(`/api/utilisateurs/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif: !u.actif }),
    });
    charger();
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconUsers className="h-5 w-5 text-brass" />
          Commerciaux
        </h1>
        <button className="btn-primary" onClick={() => setFormulaireOuvert((v) => !v)}>
          {!formulaireOuvert && <IconPlus className="h-4 w-4" />}
          {formulaireOuvert ? "Annuler" : "Nouveau commercial"}
        </button>
      </div>

      {formulaireOuvert && (
        <form onSubmit={creer} className="field-card mb-6 grid grid-cols-2 gap-3">
          <input className="field-input" placeholder="Prénom" value={champs.prenom} onChange={(e) => setChamps({ ...champs, prenom: e.target.value })} required />
          <input className="field-input" placeholder="Nom" value={champs.nom} onChange={(e) => setChamps({ ...champs, nom: e.target.value })} required />
          <input className="field-input" placeholder="Identifiant" value={champs.identifiant} onChange={(e) => setChamps({ ...champs, identifiant: e.target.value })} required />
          <input className="field-input" type="password" placeholder="Code personnel" value={champs.motDePasse} onChange={(e) => setChamps({ ...champs, motDePasse: e.target.value })} required />
          <input className="field-input col-span-2" placeholder="Téléphone" value={champs.telephone} onChange={(e) => setChamps({ ...champs, telephone: e.target.value })} />
          {erreur && <p className="col-span-2 text-sm text-danger">{erreur}</p>}
          <button className="btn-primary col-span-2" disabled={enCours}>
            {enCours ? "Création…" : "Créer le compte"}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-left text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Identifiant</th>
              <th className="px-4 py-3 font-medium">Téléphone</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-4 py-3 text-ink">{u.prenom} {u.nom}</td>
                <td className="px-4 py-3 text-ink-muted">{u.identifiant}</td>
                <td className="px-4 py-3 text-ink-muted">{u.telephone || "—"}</td>
                <td className="px-4 py-3">
                  <span className={u.actif ? "text-ok" : "text-ink-muted"}>{u.actif ? "Actif" : "Désactivé"}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs text-brass-soft hover:underline" onClick={() => toggleActif(u)}>
                    {u.actif ? "Désactiver" : "Réactiver"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
