import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { EdgeKind } from "@bstockwelldev/agent-graph-sdk";
import { EDGE_KIND_TAXONOMY } from "@/content/taxonomy";
import { radius, shadow, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";
import { TextInput } from "./ui/fields";

export function ConnectKindMenu({
  x,
  y,
  targetLabel,
  onConfirm,
  onCancel,
}: {
  x: number;
  y: number;
  targetLabel: string;
  onConfirm: (kind: EdgeKind, condition: string | null) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<EdgeKind>("sequence");
  const [condition, setCondition] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    menuRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <>
      <button
        type="button"
        aria-label="Close edge kind menu"
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: shell.zIndex.backdrop,
          background: "transparent",
          border: "none",
          cursor: "default",
        }}
      />
      <div
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          ...menuStyle,
          left: Math.min(x, window.innerWidth - 280),
          top: Math.min(y, window.innerHeight - 240),
        }}
      >
        <div id={titleId} style={{ ...typeScale.small, fontWeight: 600, marginBottom: spacing[2] }}>
          Edge to {targetLabel}
        </div>
        <div style={{ ...typeScale.caption, opacity: 0.7, marginBottom: spacing[2] }}>
          Routers need one Fallback edge and one or more Match-text branches. Other nodes use Always.
        </div>
        <div role="radiogroup" aria-label="Edge kind" style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
          {(["sequence", "conditional", "default"] as EdgeKind[]).map((option) => (
            <label key={option} style={radioRowStyle}>
              <input
                type="radio"
                name="edge-kind"
                checked={kind === option}
                onChange={() => setKind(option)}
              />
              <span>
                <strong>{EDGE_KIND_TAXONOMY[option].title}</strong>
                <span style={{ display: "block", opacity: 0.7 }}>{EDGE_KIND_TAXONOMY[option].summary}</span>
              </span>
            </label>
          ))}
        </div>
        {kind === "conditional" && (
          <div style={{ marginTop: spacing[2] }}>
            <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>
              Match this text in the previous LLM output (not the Prompt template)
            </div>
            <TextInput
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              placeholder="e.g. technical"
              autoFocus
            />
          </div>
        )}
        <div style={{ display: "flex", gap: spacing[2], marginTop: spacing[3] }}>
          <Button
            variant="primary"
            style={{ minHeight: shell.touchTarget.min, flex: 1 }}
            onClick={() => onConfirm(kind, kind === "conditional" ? condition : null)}
          >
            Add edge
          </Button>
          <Button variant="secondary" style={{ minHeight: shell.touchTarget.min }} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}

const menuStyle: CSSProperties = {
  position: "fixed",
  zIndex: shell.zIndex.tooltip,
  width: 260,
  padding: spacing[3],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.panel,
  color: text.primary,
  boxShadow: shadow[4],
  outline: "none",
};

const radioRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[2],
  minHeight: shell.touchTarget.min,
  cursor: "pointer",
  ...typeScale.caption,
};
