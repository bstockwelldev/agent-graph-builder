"use client";

import Link from "next/link";
import { Pencil, Play, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Shared hover/lift ring for clickable studio resource cards (flows, agents, tools, etc.). */
export const studioResourceCardInteractiveClass = cn(
  "border-outline-variant/25 ring-outline-variant/20 cursor-pointer border transition-all duration-200",
  "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-cyan-500/10 hover:ring-primary/40",
  "focus-visible:ring-primary/60 focus-visible:ring-2 focus-visible:outline-none",
);

export const studioCardEditHint =
  "Hover + lift indicates readiness. Click the card to edit details.";

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

export function StudioCardRunIconLink({
  href,
  label,
}: {
  href: string;
  /** Shown in aria-label (e.g. agent name). */
  label: string;
}) {
  return (
    <Link
      href={href}
      className="text-primary inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-cyan-500/10"
      aria-label={`Run with ${label}`}
      title="Run with agent"
    >
      <Play className="size-4" aria-hidden />
    </Link>
  );
}
