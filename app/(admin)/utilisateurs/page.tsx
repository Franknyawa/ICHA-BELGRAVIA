"use client";

import { useEffect, useState } from "react";
import { IconUsers, IconPlus, IconPencil, IconKey, IconTrash, IconShield, IconUser } from "@/components/icons";

type Utilisateur = {
  id: string;
  identifiant: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  role: "ADMIN" | "COMMERCIAL";
  actif: boolean;
  villeId: string | null;
};
type Ville = { id: string; nom: string };

type ChampsCreation = { identifiant: string; motDePasse: string; nom: string; prenom: string; telephone: string; role: "ADMIN" | "COMMERCIAL"; villeId: string };
const CHAMPS_VIDES: ChampsCreation = { identifiant: "", motDePasse: "", nom: "", prenom: "", telephone: "", role: "COMMERCIAL", villeId: "" };

export default function UtilisateursPage() {
  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [villes, setVilles] = useState<Ville[]>([]);
  const [filtreRole, setFiltreRole] = useState<"" | "ADMIN" | "COMMERCIAL">("");
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [champs, setChamps] = useState<ChampsCreation>(CHAMPS_VIDES);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editChamps, setEditChamps] = useState({ nom: "", prenom: "", telephone: "", villeId: "" });
  const [resetId, setResetId] = useState<string | null>(null);
  const [nouveauMdp, setNouveauMdp] = useState("");
  const [erreurLigne, setErreurLigne] = useState<string | null>(null);

  async function charger() {
    const params = filtreRole ? `?role=${filtreRole}` : "";
    const [uRes, vRes] = await Promise.all([fetch(`/api/utilisateurs${params}`), fetch("/api/referentiels")]);
    const uData = await uRes.json();
    const vData = await vRes.json();
    setUsers(uData.users || []);
    setVilles(vData.villes || []);
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreRole]);

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
    setChamps(CHAMPS_VIDES);
    setFormulaireOuvert(false);
    charger();
  }

  async function toggleActif(u: Utilisateur) {
    await fetch(`/api/utilisateurs/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif: !u.actif }),
    });
    charger();
  }

  function ouvrirEdition(u: Utilisateur) {
    setResetId(null);
    setEditId(u.id);
    setEditChamps({ nom: u.nom, prenom: u.prenom, telephone: u.telephone || "", villeId: u.villeId || "" });
  }

  async function enregistrerEdition(id: string) {
    setErreurLigne(null);
    const res = await fetch(`/api/utilisateurs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editChamps),
    });
    if (!res.ok) {
      setErreurLigne("Échec de la modification.");
      return;
    }
    setEditId(null);
    charger();
  }

  async function enregistrerMotDePasse(id: string) {
    if (nouveauMdp.length < 4) {
      setErreurLigne("Le mot de passe doit faire au moins 4 caractères.");
      return;
    }
    const res = await fetch(`/api/utilisateurs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nouveauMotDePasse: nouveauMdp }),
    });
    if (!res.ok) {
      setErreurLigne("Échec de la réinitialisation.");
      return;
    }
    setResetId(null);
    setNouveauMdp("");
  }

  async function supprimer(u: Utilisateur) {
    if (!confirm(`Supprimer définitivement ${u.prenom} ${u.nom} ?`)) return;
    const res = await fetch(`/api/utilisateurs/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Échec de la suppression.");
      return;
    }
    charger();
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl text-ink">
          <IconUsers className="h-5 w-5 text-brass" />
          Utilisateurs
        </h1>
        <button className="btn-primary" onClick={() => setFormulaireOuvert((v) => !v)}>
          {!formulaireOuvert && <IconPlus className="h-4 w-4" />}
          {formulaireOuvert ? "Annuler" : "Nouvel utilisateur"}
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {(["", "ADMIN", "COMMERCIAL"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setFiltreRole(r)}
            className={["choice-pill", filtreRole === r ? "choice-pill-active" : ""].join(" ")}
          >
            {r === "" ? "Tous" : r === "ADMIN" ? "Admins" : "Commerciaux"}
          </button>
        ))}
      </div>

      {formulaireOuvert && (
        <form onSubmit={creer} className="field-card mb-6 grid grid-cols-2 gap-3">
          <input className="field-input" placeholder="Prénom" value={champs.prenom} onChange={(e) => setChamps({ ...champs, prenom: e.target.value })} required />
          <input className="field-input" placeholder="Nom" value={champs.nom} onChange={(e) => setChamps({ ...champs, nom: e.target.value })} required />
          <select className="field-input" value={champs.role} onChange={(e) => setChamps({ ...champs, role: e.target.value as "ADMIN" | "COMMERCIAL" })}>
            <option value="COMMERCIAL">Commercial</option>
            <option value="ADMIN">Admin</option>
          </select>
          <select className="field-input" value={champs.villeId} onChange={(e) => setChamps({ ...champs, villeId: e.target.value })}>
            <option value="">Ville d'affectation (optionnel)</option>
            {villes.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
          </select>
          <input className="field-input" placeholder="Identifiant" value={champs.identifiant} onChange={(e) => setChamps({ ...champs, identifiant: e.target.value })} required />
          <input className="field-input" type="password" placeholder="Mot de passe / code" value={champs.motDePasse} onChange={(e) => setChamps({ ...champs, motDePasse: e.target.value })} required />
          <input className="field-input col-span-2" placeholder="Téléphone" value={champs.telephone} onChange={(e) => setChamps({ ...champs, telephone: e.target.value })} />
          {erreur && <p className="col-span-2 text-sm text-danger">{erreur}</p>}
          <button className="btn-primary col-span-2" disabled={enCours}>
            {enCours ? "Création…" : "Créer le compte"}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="field-card">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${u.role === "ADMIN" ? "bg-brass/15 text-brass" : "bg-bg-elevated text-ink-muted"}`}>
                  {u.role === "ADMIN" ? <IconShield className="h-4 w-4" /> : <IconUser className="h-4 w-4" />}
                </span>
                <div>
                  <p className="font-medium text-ink">
                    {u.prenom} {u.nom}
                    {!u.actif && <span className="ml-2 rounded-full bg-bg-elevated px-2 py-0.5 text-xs text-ink-muted">Désactivé</span>}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {u.identifiant} · {u.role === "ADMIN" ? "Admin" : "Commercial"}
                    {u.telephone ? ` · ${u.telephone}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => ouvrirEdition(u)} title="Modifier" className="rounded-md p-2 text-ink-muted hover:bg-bg-elevated hover:text-brass">
                  <IconPencil className="h-4 w-4" />
                </button>
                <button onClick={() => { setEditId(null); setResetId(u.id); setNouveauMdp(""); setErreurLigne(null); }} title="Réinitialiser le mot de passe" className="rounded-md p-2 text-ink-muted hover:bg-bg-elevated hover:text-brass">
                  <IconKey className="h-4 w-4" />
                </button>
                <button onClick={() => toggleActif(u)} className="text-xs font-medium text-brass hover:underline">
                  {u.actif ? "Désactiver" : "Réactiver"}
                </button>
                <button onClick={() => supprimer(u)} title="Supprimer" className="rounded-md p-2 text-ink-muted hover:bg-danger/10 hover:text-danger">
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            </div>

            {editId === u.id && (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
                <input className="field-input" placeholder="Prénom" value={editChamps.prenom} onChange={(e) => setEditChamps({ ...editChamps, prenom: e.target.value })} />
                <input className="field-input" placeholder="Nom" value={editChamps.nom} onChange={(e) => setEditChamps({ ...editChamps, nom: e.target.value })} />
                <input className="field-input" placeholder="Téléphone" value={editChamps.telephone} onChange={(e) => setEditChamps({ ...editChamps, telephone: e.target.value })} />
                <select className="field-input" value={editChamps.villeId} onChange={(e) => setEditChamps({ ...editChamps, villeId: e.target.value })}>
                  <option value="">Ville d'affectation</option>
                  {villes.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
                </select>
                {erreurLigne && <p className="col-span-2 text-sm text-danger">{erreurLigne}</p>}
                <div className="col-span-2 flex gap-2">
                  <button className="btn-primary" onClick={() => enregistrerEdition(u.id)}>Enregistrer</button>
                  <button className="btn-secondary" onClick={() => setEditId(null)}>Annuler</button>
                </div>
              </div>
            )}

            {resetId === u.id && (
              <div className="mt-3 flex items-end gap-2 border-t border-line pt-3">
                <div className="flex-1">
                  <label className="field-label">Nouveau mot de passe</label>
                  <input className="field-input" type="text" value={nouveauMdp} onChange={(e) => setNouveauMdp(e.target.value)} />
                </div>
                <button className="btn-primary" onClick={() => enregistrerMotDePasse(u.id)}>Valider</button>
                <button className="btn-secondary" onClick={() => setResetId(null)}>Annuler</button>
                {erreurLigne && <p className="text-sm text-danger">{erreurLigne}</p>}
              </div>
            )}
          </div>
        ))}
        {users.length === 0 && <p className="field-card text-center text-sm text-ink-muted">Aucun utilisateur.</p>}
      </div>
    </div>
  );
}
