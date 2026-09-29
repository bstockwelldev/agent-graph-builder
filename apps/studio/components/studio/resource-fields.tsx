"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Field building blocks for the resource forms (resource-forms-consistency-
 * plan.md, slice 2): required markers (C6), name-first generated ids (C1)
 * and inline errors for fields that validate (C4).
 */

export function FieldLabel({ htmlFor, required = false, children }: { htmlFor: string; required?: boolean; children: ReactNode }) {
  // The marker is CSS, so it stays out of the label's text (and so out of
  // the control's accessible name); the control carries aria-required.
  return (
    <Label htmlFor={htmlFor} className={cn(required && "after:text-destructive after:content-['*']")}>
      {children}
    </Label>
  );
}

function FieldError({ id, error }: { id: string; error?: string | null }) {
  return error ? (
    <p id={id} className="text-destructive text-xs">
      {error}
    </p>
  ) : null;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  mono = false,
  placeholder,
  required = false,
  autoFocus = false,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  error?: string | null;
  hint?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(mono && "font-mono text-sm")}
        autoComplete="off"
        placeholder={placeholder}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        autoFocus={autoFocus}
      />
      <FieldError id={`${id}-error`} error={error} />
      {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
    </div>
  );
}

export function AreaField({
  id,
  label,
  value,
  onChange,
  rows,
  mono = false,
  required = false,
  readOnly = false,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  mono?: boolean;
  required?: boolean;
  readOnly?: boolean;
  error?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className={cn(mono && "font-mono text-xs", readOnly && "bg-muted")}
        readOnly={readOnly}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}

export function CheckField({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="border-input size-4 rounded border"
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

/** Ids stay usable as refs, file keys and URL segments. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function idIssue(id: string | undefined): string | null {
  const trimmed = id?.trim() ?? "";
  if (!trimmed) return "Add an id.";
  return ID_PATTERN.test(trimmed) ? null : "Ids use letters, digits, _ . and - only, starting with a letter or digit.";
}

/** C1: `support_flow_a1b2` from "Support flow". */
export function idFromName(name: string, suffix: string, fallback: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/, "");
  return `${slug || fallback}_${suffix}`;
}

/** An existing resource's id: display-only, with a copy button. */
export function ReadOnlyId({ id, label = "Id" }: { id: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(id).then(
      () => setCopied(true),
      () => undefined,
    );
  };
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span>{label}</span>
      <code className="text-foreground bg-muted rounded px-1.5 py-0.5 font-mono">{id}</code>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Copy ${label.toLowerCase()} ${id}`} onClick={copy}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}

/**
 * C1 for kinds with a name: Name first (focused); on create the id follows
 * the name (`slug_suffix`) and "Customize id" swaps in an editable field;
 * after create the id is display-only.
 */
export function NameIdFields({
  idPrefix,
  name,
  id,
  editing,
  fallback,
  onChange,
}: {
  idPrefix: string;
  name: string;
  id: string;
  editing: boolean;
  /** Id stem when the name has no letters or digits, e.g. "agent". */
  fallback: string;
  onChange: (patch: { name?: string; id?: string }) => void;
}) {
  const [suffix] = useState(() => crypto.randomUUID().slice(0, 4));
  const [customizing, setCustomizing] = useState(false);
  const idError = !editing && customizing ? idIssue(id) : null;

  return (
    <>
      <TextField
        id={`${idPrefix}-name`}
        label="Name"
        value={name}
        required
        autoFocus
        onChange={(next) => onChange(editing || customizing ? { name: next } : { name: next, id: idFromName(next, suffix, fallback) })}
        hint={
          editing ? (
            <ReadOnlyId id={id} />
          ) : customizing ? undefined : (
            <span className="flex items-center gap-1.5">
              Id <code className="text-foreground font-mono">{id}</code>
              <Button type="button" variant="link" size="xs" className="h-auto p-0 text-xs" onClick={() => setCustomizing(true)}>
                Customize id
              </Button>
            </span>
          )
        }
      />
      {!editing && customizing ? (
        <TextField
          id={`${idPrefix}-id`}
          label="Id"
          value={id}
          required
          mono
          onChange={(next) => onChange({ id: next })}
          error={idError}
          hint="Graphs reference it by this id, so it can't change after you save."
        />
      ) : null}
    </>
  );
}
