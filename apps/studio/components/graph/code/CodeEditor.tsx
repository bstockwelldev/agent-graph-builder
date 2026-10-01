"use client";

import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { lintGutter, setDiagnostics, type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { border, color, fontFamily, surface, text as textColor } from "@/lib/graph-theme";
import type { RawSyntax } from "@/lib/jsonEditor";

// CodeMirror 6 for Code mode (canvas-workbench-ergonomics-plan.md §5). Only
// GraphCodeView imports this, through next/dynamic, so the editor's bundle
// loads the first time someone opens Code or Split view.

export type CodeEditorMark = { line: number; severity: "error" | "warning"; message: string };
export type CodeEditorHandle = { revealLine: (line: number) => void };

const theme = EditorView.theme(
  {
    "&": { height: "100%", background: surface.inset, color: textColor.primary, fontSize: "12px" },
    "&.cm-focused": { outline: `2px solid ${border.focus}`, outlineOffset: "-2px" },
    ".cm-scroller": { fontFamily: fontFamily.mono, lineHeight: "18px" },
    ".cm-content": { caretColor: textColor.primary },
    ".cm-cursor": { borderLeftColor: textColor.primary },
    ".cm-gutters": { background: surface.panel, color: textColor.secondary, borderRight: `1px solid ${surface.border}` },
    ".cm-activeLine": { background: "#ffffff0a" },
    ".cm-activeLineGutter": { background: "#ffffff0f", color: textColor.primary },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { background: `${color.primary[800]}aa` },
    ".cm-searchMatch": { background: `${color.warning[700]}66` },
    ".cm-panels": { background: surface.panel, color: textColor.primary },
    ".cm-panels input, .cm-panels button": { color: textColor.primary },
    ".cm-foldPlaceholder": { background: surface.raised, border: "none", color: textColor.secondary },
    ".cm-tooltip": { background: surface.card, color: textColor.primary, border: `1px solid ${surface.border}` },
  },
  { dark: true },
);

// Token colors that keep 4.5:1 on the inset well.
const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: color.primary[500] },
  { tag: [tags.string, tags.special(tags.string)], color: "#9fd8a8" },
  { tag: [tags.number, tags.bool, tags.null], color: color.warning[500] },
  { tag: [tags.keyword, tags.definition(tags.propertyName)], color: color.primary[500] },
  { tag: tags.comment, color: textColor.secondary, fontStyle: "italic" },
  { tag: [tags.punctuation, tags.bracket, tags.separator], color: textColor.secondary },
]);

const language = (syntax: RawSyntax) => (syntax === "yaml" ? yaml() : json());

function marksToDiagnostics(state: EditorState, marks: CodeEditorMark[]): LintDiagnostic[] {
  return marks
    .filter((mark) => mark.line >= 1 && mark.line <= state.doc.lines)
    .map((mark) => {
      const line = state.doc.line(mark.line);
      return { from: line.from, to: line.to, severity: mark.severity, message: mark.message };
    });
}

export default function CodeEditor({
  value,
  onChange,
  syntax,
  marks,
  onSave,
  readOnly = false,
  label,
  handleRef,
}: {
  value: string;
  onChange: (value: string) => void;
  syntax: RawSyntax;
  marks: CodeEditorMark[];
  /** ⌘S / Ctrl+S inside the editor. */
  onSave: () => void;
  readOnly?: boolean;
  label: string;
  handleRef?: { current: CodeEditorHandle | null };
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageRef = useRef(new Compartment());
  const readOnlyRef = useRef(new Compartment());
  const labelRef = useRef(new Compartment());
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          Prec.highest(
            keymap.of([
              {
                key: "Mod-s",
                run: () => {
                  callbacks.current.onSave();
                  return true;
                },
              },
            ]),
          ),
          basicSetup,
          lintGutter(),
          EditorView.lineWrapping,
          theme,
          syntaxHighlighting(highlight),
          languageRef.current.of(language(syntax)),
          readOnlyRef.current.of(EditorState.readOnly.of(readOnly)),
          labelRef.current.of(EditorView.contentAttributes.of({ "aria-label": label, tabindex: "0" })),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (handleRef) {
      handleRef.current = {
        revealLine: (lineNumber) => {
          const line = view.state.doc.line(Math.min(Math.max(1, lineNumber), view.state.doc.lines));
          view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
          view.focus();
        },
      };
    }
    return () => {
      view.destroy();
      viewRef.current = null;
      if (handleRef) handleRef.current = null;
    };
    // Created once; the effects below keep it in step with the props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        languageRef.current.reconfigure(language(syntax)),
        readOnlyRef.current.reconfigure(EditorState.readOnly.of(readOnly)),
        labelRef.current.reconfigure(EditorView.contentAttributes.of({ "aria-label": label, tabindex: "0" })),
      ],
    });
  }, [syntax, readOnly, label]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(setDiagnostics(view.state, marksToDiagnostics(view.state, marks)));
  }, [marks, value]);

  return <div ref={hostRef} data-code-editor="" style={{ height: "100%", minHeight: 0, overflow: "hidden" }} />;
}
