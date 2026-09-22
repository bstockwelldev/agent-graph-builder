---
title: Studio UX gap remediation — diagnostics, waterfall, Chat
status: proposed
capability: studio-ux-gap-remediation
depends_on:
  - studio-shell-ux-gap-analysis.md
  - studio-ux-revision-plan.md
  - p1-rollout-plan.md
linear_issue: none
last_updated: 2026-09-22
---

# Studio UX gap remediation — diagnostics, waterfall, Chat

> **Status:** Proposed design spec. Backs the five rows added to
> `roadmap.md`'s Strategic Roadmap Addendum on 2026-09-22, after a UX
> review pass that compared a third-party design critique against actual
> `apps/studio` code. Only confirmed gaps are specced here — items the
> critique raised that already exist in the repo (Chat, GenUI, selection
> dock, typed-port drag feedback, diagnostics inline on nodes) or were
> previously and explicitly rejected (Agent Anatomy page consolidation,
> MUI/`@langchain/langgraph` adoption, converting the five resource
> registries to data grids) are excluded.

## Scope

1. Diagnostics as a navigation system (P1)
2. Historical run waterfall (P1)
3. Chat: bind the scratchpad to graph/selection/run context (P2)
4. Remote/graph flow invocation from Chat (P2)
5. Collapsed reasoning/tool-use disclosure in Chat (P2)

Items 3-5 are sequential: 4 and 5 both depend on 3 landing first. 1 and 2
are independent of each other and of 3-5.

---

## 1. Diagnostics as a navigation system

### Problem

Today, compile/validation diagnostics render as inline text on node cards
(`components/graph/nodes/GraphNodeView.tsx`) and inside
`components/graph/NodeInspector.tsx`. There is no click target that
identifies the affected graph object, pans/selects it, or opens the right
inspector tab — confirmed by grep: `FlowCanvas.tsx` has no
`setCenter`/focus-by-diagnostic path anywhere in the codebase.

### Design spec

- Diagnostic data model gains: `id`, `severity`, `category`, `message`,
  `graphObjectId` (node/edge/port), `fieldPath`, `suggestedActions?`.
  - `category`: `Graph | Node | Edge | Port | Configuration | Compile | Runtime`.
- The existing validation summary surface lists each diagnostic as a
  clickable row: severity icon + concise message naming the specific
  expectation (e.g. "Output input expects `message`", not "Invalid
  output").
- Clicking a diagnostic:
  1. Resolves `graphObjectId` to a node/edge/port.
  2. Pans/zooms `FlowCanvas` (React Flow's `setCenter`/`fitBounds`) to
     center that object.
  3. Selects the node/edge — drives the existing selection state, which
     already opens `NodeInspector`.
  4. Opens the `NodeInspector` tab that owns the offending field
     (Configure for config diagnostics, I/O for port/contract
     diagnostics, Policy for policy diagnostics).
  5. If `fieldPath` is set, scrolls to and highlights that field.
- The compact badge already shown on node cards becomes clickable too,
  using the same resolve-and-focus path.
- No new page or drawer — reuses the existing selection dock
  (`NodeInspector`) and canvas, consistent with the "never add a
  standalone page when a panel/drawer can do it" precedent Phase 10
  Slice A already set (migrating `/runs/[graphId]` and `/analytics` into
  HUD panels).

### Acceptance criteria

- [ ] Every diagnostic surfaced anywhere in Studio (node badge,
      validation panel, compile-error list) is clickable.
- [ ] Clicking a diagnostic centers the canvas on the affected
      node/edge in one animation, no manual scrolling/searching required.
- [ ] The affected object is selected and visibly highlighted, distinct
      from normal selection styling.
- [ ] The correct `NodeInspector` tab opens automatically based on the
      diagnostic's category.
- [ ] Diagnostic messages name the specific field/port expectation, not
      a generic "Invalid" string.
- [ ] Works for both node-level and edge-level diagnostics.
- [ ] No new route or standalone page introduced.

---

## 2. Historical run waterfall

### Problem

No timing/sequencing visualization exists anywhere in the repo (`grep -ri
waterfall` returns zero hits). Run history — migrated into a HUD panel
in Phase 10 Slice A/D — is a sortable table only: no per-node duration,
no parallel-vs-sequential view.

### Design spec

- New view inside the existing run/history HUD panel (not a new route):
  a timeline/range-bar chart, one row per executed node, showing start
  offset, duration, and end offset relative to run start.
- Parallel vs. sequential execution renders as overlapping vs. stacked
  bars.
- Retries and nested calls render as sub-segments layered under the
  parent node's bar, not as separate top-level rows.
- Errored nodes get a visually distinct color/pattern from
  succeeded/skipped nodes.
- Bidirectional linking to the canvas:
  - Clicking a bar focuses/selects the corresponding canvas node —
    reuses the same `setCenter`+select mechanism specced for
    diagnostics (item 1), different trigger.
  - Selecting a node on the canvas while a run's waterfall is open
    scrolls the waterfall to and highlights that node's bar.
- **Styling constraint:** this stack has no MUI dependency
  (`apps/studio/AGENTS.md`'s hard "never mix" rule). Build the bar chart
  as a token-styled `components/graph/*` component (SVG or CSS-grid
  range bars) using `lib/graph-theme.ts` tokens — do not import MUI X
  Charts or any other MUI package.
- Data source: the existing run-event SSE stream already carries
  node-level start/end/status; this is a rendering layer on data that
  already exists server-side. Verify against `backend/app/runtime.py`'s
  event payload whether node-level timestamps need backend enrichment
  before scoping any backend work — do not assume it's needed.

### Acceptance criteria

- [ ] Opening a historical run's detail view shows a waterfall with one
      bar per executed node.
- [ ] Bar position/width accurately reflects each node's start offset
      and duration relative to run start.
- [ ] Parallel execution is visually distinguishable from sequential
      execution.
- [ ] Retries appear as distinguishable sub-segments, not separate
      top-level rows.
- [ ] Errored nodes are visually distinct from succeeded/skipped nodes.
- [ ] Clicking a bar focuses and selects the corresponding canvas node.
- [ ] Selecting a canvas node while the waterfall is open scrolls to
      and highlights its bar.
- [ ] No MUI dependency introduced; the component lives under
      `components/graph/*` and uses `graph-theme.ts` tokens.

---

## 3. Chat: bind the scratchpad to graph/selection/run context

### Problem

`components/workbench/panels/ChatPanel.tsx` is a direct provider/model
scratchpad (`client.sendChatMessage`) that its own code comment says
explicitly bypasses the graph engine. It only ever preselects a
`chatSessionId` from command-palette context — no awareness of the
active graph, selected node/edge, open run, or open diagnostic.

### Design spec

- `WorkbenchProvider` — already the shared state owner for panel
  context, per the existing `panelContext` usage in `ChatPanel.tsx` —
  exposes current selection state to any panel: `activeGraphId`,
  `selectedNodeIds`, `selectedEdgeIds`, `openRunId`,
  `selectedDiagnosticId`.
- `ChatPanel` reads this context and:
  - Shows a compact context strip above the message list (e.g.
    "Context: Customer Support Agent · Selected: Intent Router") when a
    graph/node is active.
  - Injects that context (graph summary, selected node's config/status,
    or open run's status) into the message sent to the provider, so the
    user doesn't have to type IDs.
- Additive to the existing scratchpad model — does not change
  `sendChatMessage`'s provider-call contract or session persistence,
  only what context is prepended before the call.
- Explicitly does not overlap with item 4 (remote flow invocation) —
  this item is read-only context injection, not execution.

### Acceptance criteria

- [ ] When a graph is open, Chat's context strip reflects the active
      graph's name.
- [ ] When a node/edge is selected on the canvas, Chat's context strip
      updates to reflect it.
- [ ] Asking a context-dependent question (e.g. "why is this node
      failing") without naming the node/graph explicitly still gets a
      context-aware response, because current selection was injected
      into the request.
- [ ] Opening Chat from a diagnostic or run carries that context through
      automatically, the same way `chatSessionId` context already works
      today via the command palette.
- [ ] No change to the underlying `sendChatMessage`/session persistence
      contract.

---

## 4. Remote/graph flow invocation from Chat

### Problem

Chat can never trigger graph execution today — it only exchanges
messages with a provider.

### Design spec

- Depends on item 3 landing first.
- New chat-side action: resolve a flow (graph) + release/version +
  environment from a natural-language request or an explicit picker,
  then call the existing run API — the same one
  `components/graph/RunPanel.tsx` already uses.
- Streamed status renders inline in the chat thread as a compact card:
  flow name, version, environment, running/succeeded/failed state, and
  per-node progress ticks as the run's SSE stream advances (reuses the
  same event stream the run HUD panel already consumes).
- On completion, a result summary card offers `[View run]` (opens the
  run HUD panel, including item 2's waterfall) and `[View flow]`
  (focuses the graph on canvas).
- **Execution safety:** since this triggers a real run, require an
  explicit confirm step before executing anything beyond a
  Draft/Local-scoped graph — a model-generated tool call must never
  silently execute against a Released/Production-scoped graph. The
  exact policy tiers (Draft/Released/Production) need a product
  decision before implementation; this spec flags it as an open
  question rather than resolving it.

### Acceptance criteria

- [ ] Chat can start a run of a named flow/graph without the user
      leaving the chat panel.
- [ ] Running status streams into the chat thread node-by-node, not
      just as a final result.
- [ ] A completed run's chat card links to `[View run]` and
      `[View flow]`, both landing the user in the correct existing HUD
      panel/canvas state.
- [ ] Any execution against a released/production-scoped graph requires
      an explicit user confirmation step before it starts.
- [ ] No duplicate run-execution code path — this calls the same run
      API `RunPanel.tsx` already uses.

---

## 5. Collapsed reasoning/tool-use disclosure in Chat

### Problem

There is currently no tool-call/reasoning trace to disclose, because the
scratchpad bypasses the graph engine (item 3) and there's no
flow-invocation trace yet (item 4). This item is the presentation layer
once those two exist.

### Design spec

- Depends on items 3 and 4.
- Render any tool call or reasoning step attached to a chat message as a
  collapsed row by default: `▸ Tool: <name> · <duration> · <status>` /
  `▸ Reasoning summary`.
- Expanding a row shows input/output (syntax-highlighted JSON) and,
  where applicable, `[Open tool]` / `[View run]` links back into the
  workspace.
- Build on `components/ai-elements/*` — already in the tree
  (`conversation.tsx`, `message.tsx`, `shimmer.tsx`,
  `prompt-input.tsx`, sourced from Vercel's AI Elements) — rather than
  introducing a parallel chat-message component system.

### Acceptance criteria

- [ ] Tool calls and reasoning steps default to collapsed, one line
      each.
- [ ] Expanding a row reveals full input/output without navigating away
      from Chat.
- [ ] Large JSON payloads don't blow out the chat panel's width/height
      when expanded (scrollable/truncated with an expand-further
      affordance).
- [ ] Implemented as an addition to `components/ai-elements/*`, not a
      parallel component system.

---

## Sequencing

Items 1 and 2 are independent of each other and of 3-5; either can ship
first. Item 3 must ship before items 4 and 5. This matches the P1/P2
split already recorded in `roadmap.md`.

## Related docs

- [Roadmap](../roadmap.md) — the five backlog rows this spec backs
- [Studio shell/canvas UX gap analysis](studio-shell-ux-gap-analysis.md) — the prior Phase 10 remediation this extends
- [Studio UX revision plan](studio-ux-revision-plan.md) — locked target-state doc for canvas/selection UX
- [P1 rollout plan](p1-rollout-plan.md) — historical replay (Slice C), which item 2 pairs with
