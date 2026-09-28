"use client";

import { useEffect, useRef } from "react";
import { IconAlert } from "@/components/icons";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Boite de confirmation stylee remplacant window.confirm().
 * Ne bloque pas le thread principal (contrairement a confirm() natif),
 * ce qui elimine l'avertissement "INP Issue" du dev-toolbar Vercel.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Supprimer",
  cancelLabel = "Annuler",
  danger = true,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmBtnRef.current?.focus();

    function surEchap(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", surEchap);
    return () => window.removeEventListener("keydown", surEchap);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="confirm-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-titre"
        aria-describedby="confirm-message"
      >
        <div className={`confirm-icone ${danger ? "confirm-icone--danger" : ""}`}>
          <IconAlert />
        </div>

        <h2 id="confirm-titre" className="confirm-titre">
          {title}
        </h2>
        <p id="confirm-message" className="confirm-message">
          {message}
        </p>

        <div className="confirm-actions">
          <button
            type="button"
            className="confirm-btn confirm-btn--secondaire"
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={`confirm-btn ${danger ? "confirm-btn--danger" : "confirm-btn--primaire"}`}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "..." : confirmLabel}
          </button>
        </div>
      </div>

      <style jsx>{`
        .confirm-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(20, 24, 20, 0.45);
          backdrop-filter: blur(2px);
          animation: confirm-fade 0.15s ease-out;
          padding: 1rem;
        }

        .confirm-panel {
          width: 100%;
          max-width: 380px;
          background: var(--panneau, #fffdf7);
          border: 1px solid var(--bordure, rgba(15, 61, 46, 0.14));
          border-radius: 14px;
          padding: 1.75rem 1.5rem 1.5rem;
          box-shadow: 0 20px 60px -10px rgba(15, 61, 46, 0.35);
          animation: confirm-pop 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.2);
          font-family: var(--police-corps, "Jost", sans-serif);
        }

        .confirm-icone {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1rem;
          background: rgba(15, 61, 46, 0.1);
          color: var(--emeraude, #0f3d2e);
        }

        .confirm-icone--danger {
          background: rgba(178, 58, 46, 0.12);
          color: #b23a2e;
        }

        .confirm-icone :global(svg) {
          width: 22px;
          height: 22px;
        }

        .confirm-titre {
          font-family: var(--police-titre, "Cormorant Garamond", serif);
          font-size: 1.35rem;
          font-weight: 600;
          margin: 0 0 0.4rem;
          color: var(--texte-fort, #1a2e22);
        }

        .confirm-message {
          font-size: 0.92rem;
          line-height: 1.5;
          color: var(--texte-att, #4b5b50);
          margin: 0 0 1.5rem;
        }

        .confirm-actions {
          display: flex;
          gap: 0.6rem;
          justify-content: flex-end;
        }

        .confirm-btn {
          appearance: none;
          border: none;
          border-radius: 8px;
          padding: 0.55rem 1.1rem;
          font-size: 0.88rem;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: filter 0.12s ease, transform 0.12s ease;
        }

        .confirm-btn:active {
          transform: scale(0.97);
        }

        .confirm-btn--secondaire {
          background: transparent;
          color: var(--texte-att, #4b5b50);
          border: 1px solid var(--bordure, rgba(15, 61, 46, 0.18));
        }

        .confirm-btn--secondaire:hover {
          background: rgba(15, 61, 46, 0.05);
        }

        .confirm-btn--primaire {
          background: var(--emeraude, #0f3d2e);
          color: #fdf9ec;
        }

        .confirm-btn--primaire:hover {
          filter: brightness(1.08);
        }

        .confirm-btn--danger {
          background: #b23a2e;
          color: #fdf9ec;
        }

        .confirm-btn--danger:hover {
          filter: brightness(1.08);
        }

        .confirm-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }

        @keyframes confirm-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes confirm-pop {
          from {
            opacity: 0;
            transform: scale(0.94) translateY(6px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .confirm-overlay,
          .confirm-panel {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
