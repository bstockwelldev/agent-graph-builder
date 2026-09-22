---
title: Studio raw config editor and console drawer — design spec
status: proposed
capability: studio-config-editor-console
depends_on:
  - strategic-design.md
  - studio-ux-gap-remediation-plan.md
linear_issue: none
last_updated: 2026-09-22
---

# Studio raw config editor and console drawer

> **Status:** Proposed design spec for two backlog items added to
> `roadmap.md`'s Strategic Roadmap Addendum on 2026-09-22, requested
> directly rather than sourced from the earlier third-party UX review.
> Numbered §6-§7, continuing from
> [studio-ux-gap-remediation-plan.md](studio-ux-gap-remediation-plan.md)'s
> §1-§5.

## Scope

6. Raw JSON/YAML config editor for node/edge/graph config (P1)
7. App-wide console/log drawer (P1)

Independent of each other; item 7 optionally reuses item 1's
click-to-focus mechanism from
[studio-ux-gap-remediation-plan.md](studio-ux-gap-remediation-plan.md#1-diagnostics-as-a-navigation-system)
but does not depend on it shipping first.

---

## 6. Raw JSON/YAML config editor

### Problem

Confirmed by code inspection: zero JSON/YAML editor libraries anywhere in
`apps/studio` (`grep` for monaco/codemirror/ace/json-editor/yaml across
`package.json` and the component tree returns nothing), and
`NodeInspector`'s Configure tab only exposes typed form fields,
per-node-type, driven by `node_configs.py`'s schemas — there is no
raw-text escape hatch for copying, bulk-editing, or scripting node/edge
config. `roadmap.md`'s own "Explicit Non-Goals" section already commits
to "preserve code escape hatches, typed SDKs, and testable runtime
artifacts" — this is a concrete instance of that commitment going
unfulfilled today.

### Design spec

- **Phase 1 — node/edge scope.** Add a "Raw" tab to the existing
  `NodeInspector` Configure/I-O/Policy/Run tab set (Slice B's tabbed
  dock). Shows the selected node's (or edge's) config as formatted JSON
  in an editable text area. Applying an edit parses and validates
  through the same schema `node_configs.py`/`contracts.py` already
  enforce for the typed form, so a raw edit can never produce a config
  the typed form couldn't also produce. Invalid JSON or a schema
  violation blocks apply and surfaces the same diagnostic-style message
  the typed form would show. Switching Configure → Raw → Configure must
  not lose, reorder, or coerce fields.
- **Phase 2 — graph scope.** A graph-level "Export/Import JSON" action
  (toolbar overflow menu or command palette entry) that serializes/
  deserializes the full `GraphDefinition` — for copy-paste between
  graphs, backup, or scripting, not a live-editing surface. Reuses the
  SDK's existing Zod schemas for round-trip validation.
- **YAML is presentational only.** Parse/serialize through a
  YAML↔JSON transform at the edit boundary; the underlying contract
  stays JSON (matches `GraphDefinition`'s actual on-disk/API shape), so
  no new backend serialization format is introduced.
- **Editor component:** no heavy editor dependency (Monaco/CodeMirror)
  unless proven necessary — start with a lightweight syntax-highlighted
  text area added to `components/graph/ui/`, consistent with
  `apps/studio/AGENTS.md`'s styling-ownership rule (token-styled, not
  Tailwind/shadcn). Revisit a full code-editor library only if
  plain-text editing proves insufficient in practice.

### Acceptance criteria

- [ ] `NodeInspector` gains a "Raw" tab showing the selected node's
      config as valid, formatted JSON.
- [ ] Editing raw JSON and applying it validates through the same
      schema the typed Configure tab uses — invalid input is rejected
      with a diagnostic-style message, never silently applied.
- [ ] Switching between Configure and Raw tabs never loses or corrupts
      field data.
- [ ] Edge config gets the same Raw tab treatment as node config.
- [ ] A graph-level export produces JSON that re-imports into a new
      graph without data loss (round-trip test).
- [ ] No new backend config format introduced — JSON stays the
      underlying contract; YAML (if offered) is a presentation-layer
      transform only.
- [ ] No heavy editor dependency added without first shipping and
      evaluating the lightweight text-area version.

---

## 7. App-wide console/log drawer

### Problem

Confirmed by code inspection: there is no standing, app-wide surface for
errors/warnings/logs. `RunPanel.tsx`'s `observe-events` section shows
node-level events for a single run only, scoped inside the run HUD
panel — not a general console. Client-side failures (e.g. the
`console.error` calls in `RunPanel.tsx` at provider-credential and
provider-model load failures) currently go only to the browser's own
devtools console, invisible to a user who isn't a developer.

Notably, `strategic-design.md`'s locked "Studio UX Principles" section
already specifies a **"Bottom run console for timeline, logs,
artifacts, metrics, and evaluations"** as part of the active layout
direction — this has never been built as such; the current run surface
is a right-side HUD panel with collapsible sections, not a bottom
console. This backlog item is best scoped as finishing that
already-locked design element, broadened slightly to also catch
app-level (non-run) errors, which is closer to what was asked for
("similar to a browser/debug terminal").

### Design spec

- A dockable bottom drawer, collapsed by default (matching
  `strategic-design.md`'s target layout), toggleable via a hotkey/HUD
  button consistent with the existing `WORKBENCH_PANELS` pattern
  (`components/workbench/panels.ts`).
- Tabs: **Logs** (app-wide info/debug), **Warnings**, **Errors**, **Run
  events** (the existing run's `observe-events` content, relocated or
  mirrored here rather than duplicated) — matching the spirit of
  `strategic-design.md`'s "Timeline | Logs | Artifacts | Metrics |
  Evaluations" grouping without necessarily building all five sub-tabs
  in the first pass. Artifacts/Metrics can fold in later if the
  existing Analytics HUD panel doesn't already cover that need.
- Each entry: timestamp, severity, source (e.g. "API", "Run",
  "Validation", "Provider"), message, and — where applicable — a
  click-to-focus action: clicking an entry tied to a node/run focuses
  the canvas or opens the relevant panel (reuses the diagnostics
  focus mechanism from
  [studio-ux-gap-remediation-plan.md §1](studio-ux-gap-remediation-plan.md#1-diagnostics-as-a-navigation-system)
  where it applies, but this item does not block on §1 shipping first).
- Client-side errors already caught in `try/catch` blocks (e.g.
  `RunPanel.tsx`'s provider-credential/model-load failures) route into
  this drawer's Errors tab in addition to `console.error`, giving
  non-developer users visibility they don't have today.
- A severity-count badge on the HUD toggle (e.g. a red dot with error
  count), consistent with how diagnostics already badge node cards.
- Styling: token-styled `components/graph/*`/`components/graph/ui/`
  component, consistent with the drawer/panel precedents already in the
  tree (`WorkbenchDrawer.tsx`).

### Acceptance criteria

**Status: implemented 2026-09-22**, with two deliberate scope decisions
noted below.

- [x] A bottom drawer exists, toggleable from the HUD, showing
      Logs/Warnings/Errors/Run events in separate tabs. **Scope decision:**
      shipped as a right-side floating panel (`WorkbenchDrawer`,
      bottom-anchored via `dockedClassName="right-4 bottom-4 ..."`)
      reusing the exact infrastructure every other global panel (Chat,
      Analytics, the resource browsers) already uses, rather than a new
      bottom-drawer primitive — this repo has no bottom-drawer component
      at all, and building one for a single panel isn't proportional.
      Functionally equivalent: toggleable, tabbed, collapsed by default.
- [x] Client-side errors currently only visible in the browser devtools
      console (e.g. provider-credential/model load failures) now also
      appear in the Errors tab. Wired at all 5 existing `console.error`
      call sites found across `RunPanel.tsx` (2) and `GraphEditor.tsx` (3:
      live validation, diagnostics refresh, run inspection/traces load).
- [x] Each log/warning/error entry shows timestamp, severity, source,
      and message.
- [x] An entry tied to a specific node/run is clickable and
      focuses/opens the relevant canvas object or panel. New canvas focus
      bridge in `lib/consoleLog.ts` (`requestCanvasFocus`/
      `consumeCanvasFocus`): navigates to the graph if not already open,
      then reuses the same `focusNode()` mechanism diagnostics/waterfall
      clicks use.
- [x] The HUD toggle shows a count/severity badge when unread errors or
      warnings exist. **Scope decision:** this repo's global panels have
      no persistent icon-button row to attach a literal badge dot to —
      confirmed by inspection, not even Chat/Analytics have one; every
      global panel is reached via hotkey + command palette only. The
      badge lives on the Console command palette entry's label instead
      (e.g. "Console — 2 errors, 1 warning"), consistent with how this
      app actually surfaces every other global panel.
- [x] Existing run-event content (`observe-events`) is not duplicated —
      this drawer either relocates or mirrors it, not forks it into a
      second, divergent implementation. Mirrored: `GraphEditor.tsx`'s SSE
      `onEvent` handler pushes into the console log store as an
      independent second subscriber; `RunPanel.tsx`'s own Event log
      section is untouched.
- [x] Drawer is collapsed by default and does not permanently consume
      canvas space, consistent with the "quiet canvas" thesis already in
      `studio-ux-revision-plan.md`. True by construction —
      `WorkbenchDrawer` only renders when it's the active panel.

---

## Related docs

- [Roadmap](../roadmap.md) — the two backlog rows this spec backs
- [Strategic design](../strategic-design.md) — locks the "bottom run console" concept item 7 completes
- [Studio UX gap remediation plan](studio-ux-gap-remediation-plan.md) — diagnostics-as-navigation focus mechanism item 7 reuses
- [Studio shell/canvas UX gap analysis](studio-shell-ux-gap-analysis.md)
