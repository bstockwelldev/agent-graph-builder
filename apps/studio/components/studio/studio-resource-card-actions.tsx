"use client";

import { Pencil, Trash2 } from "lucide-react";

export function StudioCardEditIconButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  /** Shown in aria-label / title (e.g. agent name, tool id). */
  label: string;
}) {
  return (
    <button
      type="button"
      className="text-primary inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Edit ${label}`}
      title="Edit"
    >
      <Pencil className="size-4" aria-hidden />
    </button>
  );
}

export function StudioCardDeleteIconButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className="text-destructive inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Delete ${label}`}
      title="Delete"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}
