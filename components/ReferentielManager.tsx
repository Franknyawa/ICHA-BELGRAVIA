"use client";

import { useEffect, useState } from "react";
import { IconPlus, IconPencil, IconTrash } from "@/components/icons";

type Item = { id: string; nom: string; actif: boolean };

export default function ReferentielManager({
  titre,
  icon: Icon,
  apiBase,
}: {
  titre: string;
  icon: React.ComponentType<{ className?: string }>;
  apiBase: string; // ex. "/api/villes" — l'API doit exposer { <cle>: Item[] } en GET
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [cleReponse, setCleReponse] = useState<string>("");
  const [nouveauNom, setNouveauNom] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNom, setEditNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    const res = await fetch(apiBase);
    const data = await res.json();
    const cle = Object.keys(data)[0];
    setCleReponse(cle);
    setItems(data[cle] || []);
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!nouveauNom.trim()) return;
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom: nouveauNom.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.error || "Erreur lors de la création.");
      return;
    }
    setNouveauNom("");
    charger();
  }

  async function enregistrerEdition(id: string) {
    if (!editNom.trim()) return;
    await fetch(`${apiBase}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom: editNom.trim() }),
    });
    setEditId(null);
    charger();
  }

  async function toggleActif(item: Item) {
    await fetch(`${apiBase}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif: !item.actif }),
    });
    charger();
  }

  async function supprimer(item: Item) {
    if (!confirm(`Supprimer "${item.nom}" ?`)) return;
    const res = await fetch(`${apiBase}/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Échec de la suppression.");
      return;
    }
    charger();
  }

  return (
    <div className="field-card">
      <p className="section-eyebrow mb-3">
        <Icon className="h-4 w-4" />
        {titre}
      </p>

      <form onSubmit={creer} className="mb-3 flex gap-2">
        <input
          className="field-input"
          placeholder={`Ajouter…`}
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
        />
        <button className="btn-secondary shrink-0" type="submit">
          <IconPlus className="h-4 w-4" />
        </button>
      </form>
      {erreur && <p className="mb-2 text-sm text-danger">{erreur}</p>}

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-bg-elevated px-3 py-2">
            {editId === item.id ? (
              <input
                className="field-input mr-2 flex-1 py-1.5"
                value={editNom}
                autoFocus
                onChange={(e) => setEditNom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enregistrerEdition(item.id)}
              />
            ) : (
              <span className={item.actif ? "text-ink" : "text-ink-muted line-through"}>{item.nom}</span>
            )}
            <div className="flex shrink-0 items-center gap-1">
              {editId === item.id ? (
                <>
                  <button className="text-xs font-medium text-brass hover:underline" onClick={() => enregistrerEdition(item.id)}>
                    OK
                  </button>
                  <button className="text-xs text-ink-muted hover:underline" onClick={() => setEditId(null)}>
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="rounded p-1.5 text-ink-muted hover:text-brass"
                    onClick={() => { setEditId(item.id); setEditNom(item.nom); }}
                    title="Modifier"
                  >
                    <IconPencil className="h-3.5 w-3.5" />
                  </button>
                  <button className="text-xs text-ink-muted hover:underline" onClick={() => toggleActif(item)}>
                    {item.actif ? "Désactiver" : "Réactiver"}
                  </button>
                  <button
                    className="rounded p-1.5 text-ink-muted hover:text-danger"
                    onClick={() => supprimer(item)}
                    title="Supprimer"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-muted">Aucun élément.</p>}
      </ul>
    </div>
  );
}
