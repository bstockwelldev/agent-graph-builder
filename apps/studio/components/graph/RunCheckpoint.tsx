"use client";

import { useState } from "react";
import { PauseCircle } from "lucide-react";

import { errorDetail } from "@/lib/apiErrors";
import { parseGenuiSurface, type GenuiData } from "@/lib/genui";
import { accentSurface, color, radius, spacing, text, typeScale } from "@/lib/graph-theme";

import { Button } from "./ui/Button";
import { GenuiSurface, type GenuiValues } from "./ui/GenuiSurface";
import { PasswordInput, TextArea } from "./ui/fields";

export type Checkpoint = {
  nodeId: string;
  label: string;
  content: string;
  /** The gate's `genuiCheckpointSurfaceJson` (may be empty). */
  surfaceJson: string;
};

export type ResumeDecision = { approve: boolean; reason?: string; values?: Record<string, unknown>; apiKey?: string };

/** The API's 409 when a paused run's provider needs its key again (keys are never stored). */
const NEEDS_KEY = /needs an API key/i;

/**
 * The approver's view of a run paused at a human_gate: the gate's message,
 * its GenUI surface (form fields editable, buttons live), an optional
 * reason, and Approve / Reject. A surface button with actionId "approve" or
 * "reject" does the same as the matching button; any other actionId
 * approves and is recorded as `values.action`.
 */
export function RunCheckpoint({
  checkpoint,
  onResume,
  data = null,
}: {
  checkpoint: Checkpoint;
  onResume: (decision: ResumeDecision) => Promise<void>;
  /** The paused run's input and traces, for the surface's `$ref`s. */
  data?: GenuiData | null;
}) {
  const { surface, error: surfaceError } = parseGenuiSurface(checkpoint.surfaceJson);
  const [values, setValues] = useState<GenuiValues>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [apiKey, setApiKey] = useState("");

  const decide = async (approve: boolean, action?: string) => {
    setBusy(approve ? "approve" : "reject");
    setError(null);
    try {
      const formValues: Record<string, unknown> = { ...values, ...(action ? { action } : {}) };
      await onResume({
        approve,
        reason: reason.trim() || undefined,
        values: approve && Object.keys(formValues).length > 0 ? formValues : undefined,
        apiKey: approve && apiKey.trim() ? apiKey.trim() : undefined,
      });
    } catch (err) {
      const message = errorDetail(err);
      if (NEEDS_KEY.test(message)) setNeedsKey(true);
      setError(message);
    } finally {
      setBusy(null);
    }
  };

  const onAction = (actionId: string) => {
    if (actionId === "reject") void decide(false);
    else if (actionId === "approve") void decide(true);
    else void decide(true, actionId);
  };

  return (
    <section
      role="region"
      aria-label={`Approval needed at ${checkpoint.label}`}
      style={{ marginTop: spacing[2], padding: spacing[3], borderRadius: radius.lg, border: `1px solid ${color.primary[500]}60`, background: `${color.primary[500]}10` }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: spacing[2], ...typeScale.small, color: text.primary }}>
        <PauseCircle size={16} color={color.primary[500]} aria-hidden="true" />
        Waiting for approval at <b>{checkpoint.label}</b>
      </div>
      {checkpoint.content && <p style={{ margin: `${spacing[2]}px 0 0`, fontSize: 13, lineHeight: "18px", color: text.primary, whiteSpace: "pre-wrap" }}>{checkpoint.content}</p>}
      {surface && (
        <div style={{ marginTop: spacing[2] }}>
          <GenuiSurface surface={surface} values={values} onValuesChange={setValues} onAction={onAction} disabled={busy !== null} data={data} />
        </div>
      )}
      {surfaceError && (
        <p style={{ margin: `${spacing[2]}px 0 0`, ...typeScale.caption, color: text.secondary }}>The gate&apos;s surface can&apos;t render ({surfaceError}); approve or reject below.</p>
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: spacing[2] }}>
        <span style={{ ...typeScale.caption, color: text.secondary }}>Reason (optional)</span>
        <TextArea aria-label="Reason" value={reason} rows={2} disabled={busy !== null} onChange={(event) => setReason(event.target.value)} placeholder="Recorded on the run" />
      </label>
      {needsKey && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: spacing[2] }}>
          <span style={{ ...typeScale.caption, color: text.secondary }}>API key (used for this resume only, never stored)</span>
          <PasswordInput aria-label="API key" value={apiKey} disabled={busy !== null} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" />
        </label>
      )}
      {error && (
        <div role="alert" style={{ marginTop: spacing[2], padding: spacing[2], borderRadius: radius.md, border: `1px solid ${accentSurface.destructive.border}`, background: accentSurface.destructive.bg, color: accentSurface.destructive.text, fontSize: 12 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: spacing[2], marginTop: spacing[2] }}>
        <Button variant="primary" disabled={busy !== null} onClick={() => void decide(true)}>
          {busy === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button variant="destructive" disabled={busy !== null} onClick={() => void decide(false)}>
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
    </section>
  );
}
