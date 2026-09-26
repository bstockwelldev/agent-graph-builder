import { useState } from "react";
import { FlaskConical } from "lucide-react";
import type { EdgeTransform, TransformPreviewResponse } from "@bstockwelldev/agent-graph-sdk";
import { client } from "@/lib/api-client";
import { accentSurface, border, color, fontFamily, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import { TextArea } from "./ui/fields";

/** Sample text is parsed as JSON when it is valid JSON, else used as plain text. */
export function parseSample(sample: string): unknown {
  try {
    return JSON.parse(sample);
  } catch {
    return sample;
  }
}

function formatOutput(output: unknown): string {
  return typeof output === "string" ? output : JSON.stringify(output, null, 2);
}

/**
 * "Try it" for a transform (inline, or `{ transform_id }` from the library):
 * runs it on a sample value through `POST /api/transforms/preview` — the
 * same engine a run uses — and shows the output or the error a run would
 * fail with. Nothing is saved.
 */
export function TransformTryIt({ transform }: { transform: EdgeTransform }) {
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState("");
  const [result, setResult] = useState<TransformPreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function preview() {
    setBusy(true);
    setRequestError(null);
    try {
      setResult(await client.transforms.preview(transform, parseSample(sample)));
    } catch (err) {
      setResult(null);
      setRequestError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <FlaskConical size={14} aria-hidden="true" /> Try it
      </Button>
    );
  }

  const error = requestError ?? (result && !result.ok ? result.error : null);
  return (
    <div style={{ marginTop: spacing[2], padding: spacing[2], borderRadius: radius.lg, border: `1px solid ${border.subtle}`, background: surface.inset }}>
      <Field label="Sample input" hint='JSON (e.g. {"topic": "indexes"}) or plain text. Not saved.'>
        {(id) => (
          <TextArea
            id={id}
            value={sample}
            rows={3}
            spellCheck={false}
            placeholder='{"topic": "indexes"}'
            onChange={(e) => setSample(e.target.value)}
            style={{ fontFamily: fontFamily.mono, fontSize: 12 }}
          />
        )}
      </Field>
      <Button variant="primary" disabled={busy} onClick={() => void preview()}>
        {busy ? "Running…" : "Preview"}
      </Button>
      {error && (
        <div role="alert" style={{ ...typeScale.caption, marginTop: spacing[2], color: accentSurface.destructive.text }}>
          {error}
        </div>
      )}
      {result?.ok && (
        <div style={{ marginTop: spacing[2] }}>
          <div style={{ ...typeScale.caption, color: text.muted, marginBottom: 4 }}>Output</div>
          <pre
            aria-label="Preview output"
            style={{ margin: 0, padding: spacing[2], borderRadius: radius.md, border: `1px solid ${color.success[500]}55`, fontFamily: fontFamily.mono, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", color: text.primary }}
          >
            {formatOutput(result.output)}
          </pre>
        </div>
      )}
    </div>
  );
}
