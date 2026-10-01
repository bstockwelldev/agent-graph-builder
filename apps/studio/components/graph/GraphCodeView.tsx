"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Braces, CircleAlert, FileCode2, ListTree } from "lucide-react";
import { graphDefinitionSchema, type Diagnostic, type GraphDefinition } from "@bstockwelldev/agent-graph-sdk";
import { exportGraphJson } from "@/lib/graphJsonPortability";
import { checkGraphCode, diagnosticProblems, type CodeProblem } from "@/lib/graphCode";
import { color, fontFamily, radius, spacing, surface, text as textColor, typeScale, accentSurface } from "@/lib/graph-theme";
import { fromCanonicalJson, readRawSyntax, toCanonicalJson, writeRawSyntax, type RawSyntax } from "@/lib/jsonEditor";
import { diffHunks, diffText, type DiffHunkLine } from "@/lib/textDiff";
import type { CodeEditorHandle, CodeEditorMark } from "./code/CodeEditor";
import { Button } from "./ui/Button";
import { IconTabs } from "./ui/IconTabs";

// CodeMirror loads with the first Code or Split view, not with the canvas.
const CodeEditor = dynamic(() => import("./code/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div role="status" style={{ padding: spacing[3], ...typeScale.caption, color: textColor.secondary }}>
      Loading editor…
    </div>
  ),
});

const SYNTAX_TABS = [
  { id: "json", label: "JSON", icon: <Braces size={13} /> },
  { id: "yaml", label: "YAML", icon: <ListTree size={13} /> },
];

function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== null && entry !== undefined)
        .map(([key, entry]) => [key, withoutNulls(entry)]),
    );
  }
  return value;
}

/**
 * Schema key order, no `null`s and no server timestamp, so the review
 * shows edits rather than formatting (a null and a missing field mean the
 * same thing to the API).
 */
function normalizedJson(graph: GraphDefinition): string {
  const parsed = graphDefinitionSchema.safeParse(graph);
  const rest: Record<string, unknown> = { ...(parsed.success ? parsed.data : graph) };
  delete rest.updated_at;
  return JSON.stringify(withoutNulls(rest), null, 2);
}

type Review = { graph: GraphDefinition; lines: DiffHunkLine[]; added: number; removed: number };

const DIFF_STYLE = {
  same: { sign: " ", background: "transparent", color: textColor.secondary },
  added: { sign: "+", background: accentSurface.successAction.bg, color: textColor.primary },
  removed: { sign: "-", background: accentSurface.destructive.bg, color: textColor.primary },
} as const;

/**
 * Code mode (canvas-workbench-ergonomics-plan.md §5): the whole graph as
 * JSON or YAML in CodeMirror. Problems sit on their lines; Apply updates
 * the canvas (undoable), and Save (⌘S) validates, shows the change against
 * the saved version, then applies and persists in one step. A failed check
 * or save leaves the text as typed. Canvas edits refresh an untouched
 * draft; a draft with edits is kept and flagged, as in the config panel.
 */
export function GraphCodeView({
  graph,
  getSavedGraph,
  diagnostics,
  saving,
  onApply,
  onSave,
  saveRef,
}: {
  graph: GraphDefinition;
  /** The last saved version, for the review diff. */
  getSavedGraph: () => GraphDefinition | null;
  diagnostics: Diagnostic[];
  saving: boolean;
  onApply: (graph: GraphDefinition) => void;
  /** Applies and persists; false when the save failed. */
  onSave: (graph: GraphDefinition) => Promise<boolean>;
  /** Set to this view's save so ⌘S outside the editor saves the code too. */
  saveRef?: { current: (() => void) | null };
}) {
  const [syntax, setSyntax] = useState<RawSyntax>(readRawSyntax);
  const canonical = exportGraphJson(graph);
  const [base, setBase] = useState(canonical);
  const [text, setText] = useState(() => fromCanonicalJson(canonical, syntax));
  const [stale, setStale] = useState(false);
  const [checkProblems, setCheckProblems] = useState<CodeProblem[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editorRef = useRef<CodeEditorHandle | null>(null);

  const hasEdits = text !== fromCanonicalJson(base, syntax);
  if (canonical !== base) {
    // Render-time sync, as RawConfigEditor: an untouched draft follows the canvas.
    setBase(canonical);
    if (hasEdits) setStale(true);
    else setText(fromCanonicalJson(canonical, syntax));
  }

  const deferredText = useDeferredValue(text);
  const graphProblems = useMemo(() => diagnosticProblems(deferredText, diagnostics), [deferredText, diagnostics]);
  const problems = useMemo(() => [...checkProblems, ...graphProblems], [checkProblems, graphProblems]);
  const marks = useMemo<CodeEditorMark[]>(
    () => problems.filter((problem) => problem.line !== null).map((problem) => ({ line: problem.line!, severity: problem.severity, message: problem.message })),
    [problems],
  );

  function edit(next: string) {
    setText(next);
    setNotice(null);
    if (checkProblems.length) setCheckProblems([]);
    if (review) setReview(null);
  }

  function switchSyntax(next: RawSyntax) {
    if (next === syntax) return;
    const converted = toCanonicalJson(text, syntax);
    let json: string | null = null;
    if (converted.ok) {
      try {
        json = JSON.stringify(JSON.parse(converted.json), null, 2);
      } catch {
        json = null;
      }
    }
    if (json === null) {
      const check = checkGraphCode(text, syntax, graph.id);
      setCheckProblems(check.ok ? [] : check.problems);
      setNotice(`Fix the ${syntax.toUpperCase()} before switching to ${next.toUpperCase()}.`);
      return;
    }
    setSyntax(next);
    writeRawSyntax(next);
    setReview(null);
    setText(hasEdits ? fromCanonicalJson(json, next) : fromCanonicalJson(base, next));
  }

  /** The graph the text describes, or null after showing why it isn't one. */
  function checked(): GraphDefinition | null {
    if (!hasEdits) return graph;
    const check = checkGraphCode(text, syntax, graph.id);
    if (!check.ok) {
      setCheckProblems(check.problems);
      const first = check.problems.find((problem) => problem.line !== null);
      if (first?.line) editorRef.current?.revealLine(first.line);
      return null;
    }
    setCheckProblems([]);
    return check.graph;
  }

  function resetTo(next: GraphDefinition) {
    const json = exportGraphJson(next);
    setBase(json);
    setText(fromCanonicalJson(json, syntax));
    setStale(false);
  }

  function handleApply() {
    const next = checked();
    if (!next) return;
    resetTo(next);
    onApply(next);
    setNotice("Applied to the canvas. Save to keep it.");
  }

  function handleSave() {
    if (saving) return;
    const next = checked();
    if (!next) return;
    const saved = getSavedGraph();
    const before = saved ? fromCanonicalJson(normalizedJson(saved), syntax) : "";
    const after = fromCanonicalJson(normalizedJson(next), syntax);
    if (before === after) {
      setNotice("No changes to save.");
      return;
    }
    const lines = diffText(before, after);
    setReview({
      graph: next,
      lines: diffHunks(lines),
      added: lines.filter((line) => line.kind === "added").length,
      removed: lines.filter((line) => line.kind === "removed").length,
    });
  }

  async function confirmSave() {
    if (!review) return;
    const next = review.graph;
    const ok = await onSave(next);
    setReview(null);
    if (ok) {
      resetTo(next);
      setNotice("Saved.");
    } else {
      setNotice("Save failed; your text is unchanged.");
    }
  }

  function handleReset() {
    resetTo(graph);
    setCheckProblems([]);
    setReview(null);
    setNotice(null);
  }

  const saveHandler = useRef(handleSave);
  saveHandler.current = handleSave;
  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = () => saveHandler.current();
    return () => {
      saveRef.current = null;
    };
  }, [saveRef]);

  return (
    <section aria-label="Graph code" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: surface.panel }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: spacing[2], padding: `${spacing[2]}px ${spacing[3]}px`, borderBottom: `1px solid ${surface.border}` }}>
        <FileCode2 size={16} aria-hidden style={{ color: color.primary[500] }} />
        <h2 style={{ ...typeScale.small, fontWeight: 600, color: textColor.primary, margin: 0 }}>Graph code</h2>
        <IconTabs tabs={SYNTAX_TABS} activeId={syntax} onChange={(id) => switchSyntax(id as RawSyntax)} aria-label="Code format" />
        <span role="status" style={{ ...typeScale.caption, color: textColor.secondary, flex: 1, minWidth: 0 }}>
          {notice ?? (hasEdits ? "Edited: Apply updates the canvas, ⌘S saves." : "")}
        </span>
        <Button variant="secondary" disabled={!hasEdits} onClick={handleReset}>
          Reset
        </Button>
        <Button variant="secondary" disabled={!hasEdits} onClick={handleApply}>
          Apply
        </Button>
        <Button variant="primary" disabled={saving} onClick={handleSave} title="Save (⌘S)">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {stale && (
        <div role="status" style={{ ...typeScale.caption, color: textColor.secondary, padding: `${spacing[1]}px ${spacing[3]}px` }}>
          The canvas changed since you started editing. Apply or Save keeps your version; Reset loads the latest.
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: review ? "none" : "block" }}>
        <CodeEditor value={text} onChange={edit} syntax={syntax} marks={marks} onSave={handleSave} label={`Graph code (${syntax.toUpperCase()})`} handleRef={editorRef} />
      </div>
      {review && <ReviewChanges review={review} saving={saving} onConfirm={() => void confirmSave()} onCancel={() => setReview(null)} />}
      {!review && problems.length > 0 && (
        <ul aria-label="Problems" style={{ listStyle: "none", margin: 0, padding: spacing[2], maxHeight: 160, overflow: "auto", borderTop: `1px solid ${surface.border}` }}>
          {problems.map((problem, index) => (
            <li key={index}>
              <button
                type="button"
                className="agb-focus-ring agb-hoverable"
                disabled={problem.line === null}
                onClick={() => problem.line !== null && editorRef.current?.revealLine(problem.line)}
                style={{ display: "flex", gap: spacing[2], width: "100%", textAlign: "left", alignItems: "flex-start", padding: `${spacing[1]}px ${spacing[2]}px`, border: "none", borderRadius: radius.md, background: "transparent", color: textColor.primary, cursor: problem.line === null ? "default" : "pointer", ...typeScale.caption }}
              >
                {problem.severity === "error" ? (
                  <CircleAlert size={13} aria-label="Error" style={{ color: color.error[500], flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <AlertTriangle size={13} aria-label="Warning" style={{ color: color.warning[500], flexShrink: 0, marginTop: 2 }} />
                )}
                <span style={{ flex: 1 }}>{problem.message}</span>
                {problem.line !== null && <span style={{ color: textColor.secondary, fontFamily: fontFamily.mono }}>Line {problem.line}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewChanges({ review, saving, onConfirm, onCancel }: { review: Review; saving: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="region" aria-label="Review changes" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: spacing[2], padding: `${spacing[2]}px ${spacing[3]}px` }}>
        <span style={{ ...typeScale.small, color: textColor.primary, flex: 1 }}>
          Changes against the saved version: {review.added} added · {review.removed} removed
        </span>
        <Button variant="secondary" onClick={onCancel}>
          Back to editing
        </Button>
        <Button variant="primary" disabled={saving} onClick={onConfirm}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
      <pre
        tabIndex={0}
        aria-label="Changes"
        className="agb-focus-ring"
        style={{ flex: 1, minHeight: 0, margin: 0, overflow: "auto", background: surface.inset, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: "18px" }}
      >
        {review.lines.map((line, index) =>
          line.kind === "skip" ? (
            <div key={index} style={{ color: textColor.secondary, padding: "0 8px", background: surface.panel }}>
              ⋯ {line.count} unchanged line{line.count === 1 ? "" : "s"}
            </div>
          ) : (
            <div key={index} style={{ background: DIFF_STYLE[line.kind].background, color: DIFF_STYLE[line.kind].color, padding: "0 8px", whiteSpace: "pre" }}>
              <span aria-hidden="true">{DIFF_STYLE[line.kind].sign} </span>
              <span className="sr-only">{line.kind === "same" ? "" : `${line.kind}: `}</span>
              {line.text || " "}
            </div>
          ),
        )}
      </pre>
    </div>
  );
}
