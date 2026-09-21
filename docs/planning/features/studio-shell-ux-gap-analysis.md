---
title: Studio shell/canvas UX gap analysis
status: proposed
capability: studio-shell-ux-gap-analysis
depends_on:
  - studio-ux-revision-plan.md
  - p1-rollout-plan.md
  - graph-native-control-plane-plan.md
linear_issue: none
last_updated: 2026-09-21
---

# Studio shell/canvas UX gap analysis

> **Status:** Proposed. A review, not a build — it catalogs the gap between
> `apps/studio` as it exists today and the two locked target-state docs
> (`studio-ux-revision-plan.md`, and the "UX integration constraint"
> section of `p1-rollout-plan.md`), then proposes a remediation sequence.
> No code changes are implied by this document.

## Context

Mid-way through the P1/P2 rollout work, a reference screenshot of IBM
Langflow Desktop was raised as an example of the target feel for the Studio
HUD/shell: every surface — component config, prompt/context inspection,
agent settings — docked around the canvas, nothing routing away from the
graph. That comparison was asked for as its own review pass. At the time it
only got folded ad hoc into `p1-rollout-plan.md` as one paragraph — the
`/runs/[graphId]` standalone-page gap — rather than the full assessment
that was actually requested.

This document is that assessment, done properly: a systematic comparison of
every current `apps/studio` surface against every concrete requirement in
the two locked target-state docs, evidence-cited throughout, resulting in a
prioritized gap table and a proposed remediation sequence.

## Method

Two independent evidence-gathering passes, each cited to file:line or doc
section, no unverified claims:

1. **Current-state inventory** — every route under `apps/studio/app/`, the
   full `WorkbenchPanelId` registry (`components/workbench/panels.ts`), the
   click-path to reach each capability area from the canvas, canvas
   interaction affordances (double-click, context menu, focus mode, typed
   handles), which of the six named run/debug scopes exist in code, and the
   actual design system/node-card visual facts.
2. **Target-state extraction** — every concrete UX requirement stated in
   `studio-ux-revision-plan.md` (all 13 sections), `p1-rollout-plan.md`'s
   "UX integration constraint" section, and the UX-relevant rows of
   `roadmap.md`'s Strategic Roadmap Addendum and Recommended Phases,
   cross-checked against `graph-native-control-plane-plan.md` and
   `strategic-design.md` for anything not already covered.

## Gap table

Findings split into three tiers because they carry very different weight —
conflating "a locked doc's rule was violated" with "a documented future-work
item is still future work" would misstate the review.

### Tier 1 — constraint violations

Things a locked doc already said should be true today, and aren't.

| Gap | Evidence |
| --- | --- |
| `apps/studio/app/runs/[graphId]/page.tsx` is still a standalone page | `p1-rollout-plan.md`'s UX integration constraint section named this explicitly and said migrate it "no later than Slice A." Never done — confirmed still present in the route tree and in production builds. |
| `apps/studio/app/analytics/page.tsx` is also a standalone page | Same category of violation as the run-history page; never previously named in writing. No `analytics` entry exists in the `WorkbenchPanelId` registry. |
| Resource registries (prompts/tools/agents/mcp/llm-profiles) can't actually be edited without leaving the canvas | The in-canvas HUD door (`ResourceBrowserPanel`, global scope) is list-only with an "Open full page →" link back to the standalone CRUD route. This violates `p1-rollout-plan.md`'s "anatomy management ... reachable in 1-2 clicks from the canvas HUD" requirement for the exact capability that requirement names first. |
| Knowledge base has zero UI anywhere in `apps/studio` | Confirmed by full-tree grep — no route, no component, no client method references "knowledge." Backend (`backend/app/knowledge.py`, `embedding_model.py`) and the P2 lineage work (`GET /api/graphs/{graph_id}/knowledge/lineage`) both exist server-side with no consumer. Already tracked as a separate suggested task (queued this session); referenced here, not re-queued. |
| Node inspector isn't part of the panel registry | `NodeInspector`/`EdgeInspector` render as a hand-rolled sibling block outside `WorkbenchDrawer`, mutually exclusive with the `run`/`releases`/`routingLab` panels — inspecting a node while one of those is open costs an extra click to close it first. Not named in either locked doc, but a measured, real friction cost. |

### Tier 2 — `studio-ux-revision-plan.md`'s own Revision Sequence, still open

Section 12 lists 10 items; items 1-3 are done (rail/drawer graph switcher,
rebuilt toolbar, a first-pass selection dock). Items 4-10 were never
claimed shipped — this tier makes their current status explicit rather than
leaving them as an implicit backlog.

| Gap | Evidence |
| --- | --- |
| Selection dock has no Configure/I-O/Policy/Run **tabs** | `NodeInspector` is a flat collapsible-section form, not a tabbed dock. No node-scoped Policy tab surfacing that node's active policy exceptions. No "nothing selected" workflow summary (node/edge counts, validation summary, entrypoints/terminal nodes, recent runs) — Section 6's spec for both selection states. |
| No node launcher | No `onPaneDoubleClick` handler exists anywhere; the only "add node" UI is the static 12-item `NodePalette` list (no search/fuzzy filter) or the equivalent right-click "Add node" context-menu items. Section 7 and Sequence item 4 call for a searchable double-click launcher. |
| No focus mode | Zero trace in code (Sequence item 6). |
| No typed-port / compatible-target connect feedback | Handles are plain circular dots colored by node-type accent, not differentiated by port/data type; no highlight-compatible-targets-on-drag behavior (Section 8, Sequence item 5). |
| Half of the six named run/debug scopes don't exist | "Run," "Run with fixture," and "Replay run" exist and match their spec. **"Run from selected node" has zero trace anywhere** — every run always starts at the graph's `entry_node_id`. **"Debug run"** (auto-opening a trace console) doesn't exist as a distinct action. **"Validate"** isn't a standalone labeled action — it's implicit, via a 400ms-debounced auto-validate effect plus an unrelated "Compile" button, never labeled "Validate" anywhere in the UI. |
| Toolbar's "Run ▾" split-button doesn't exist | Section 5 calls for one Run control with split options (run from here / with fixture / with production inputs). Currently Run and Run-with-fixture are two separately-placed buttons in different sections of the same panel. |
| Node cards are missing the "summary" line | Category label, title, and runtime status are present (`GraphNodeView.tsx`); the description/summary line Section 10 calls for is not. |
| No operational data grids for registries/run history/eval datasets | Sequence item 9. Current registry pages are plain lists inside dialogs, not sortable/filterable data grids. |
| No standardized styling-ownership pass | Sequence item 10 — too broad to verify with a grep; flagged as still open per the doc, not independently confirmed either way. |

### Tier 3 — named elsewhere, not in either primary doc's checklist

| Gap | Evidence |
| --- | --- |
| No large-graph complexity management | `graph-native-control-plane-plan.md` names this as its own strategic pillar — subgraphs with typed interfaces, collapse/expand, dependency search, blast-radius analysis, multiple graph views, a graph health score. Nothing in `studio-ux-revision-plan.md` covers it, and nothing in `apps/studio` implements any part of it. This is a distinct, larger body of work, not a Tier 1/2 remediation item — recommend it stays its own future design pass, the same way `p1-rollout-plan.md` explicitly deferred P2's areas rather than folding them in. |

## Documentation hygiene note

`roadmap.md`'s "Recommended phases" section still lists Phase 6 (canvas
identity: node color/shape taxonomy, blueprint background) and Phase 7
(shell resilience: shimmers, empty states, collapsible rails) as open
items, while the "Completed / in flight" table already marks that same
work Shipped (2026-09-09). This is a documentation self-contradiction the
target-state extraction pass caught — not a real product gap — and is
fixed alongside this doc's roadmap update below.

## Recommended remediation sequence

Proposed as **Phase 10**, continuing the roadmap's existing Phase 5-9
numbering, sliced cheapest/most-violated first — mirroring how
`p1-rollout-plan.md` sliced P1 by risk and reuse rather than by doc
section.

**Slice A — Close constraint violations.** Migrate `/runs/[graphId]` and
`/analytics` into HUD panels (new `runs`/`analytics` entries in
`panels.ts`, following the exact pattern `releases`/`routingLab` already
use). Give the resource-registry HUD panels inline edit, not just
list-and-link. Fold the node inspector into the panel registry properly,
or at minimum resolve its mutual-exclusivity friction with
Run/Releases/Routing-lab.

**Slice B — Selection dock rebuild.** Configure/I-O/Policy/Run tabs on
`NodeInspector`; node-scoped policy-exception surfacing in the new Policy
tab (reusing `client.listPolicyExceptions`/`createPolicyException` from
the P2 policy-overlays work); the "nothing selected" workflow summary.

**Slice C — Run/Debug/canvas affordances.** A real, labeled "Validate"
action; "Run from selected node"; "Debug run"; a double-click + searchable
node launcher; typed-port/compatible-target connect feedback; consolidate
Run into the doc's split-button model.

**Slice D — Lower-priority polish.** Focus mode, operational data grids
for registries/run history, node-card summary line, styling-ownership
standardization.

**Explicitly out of this sequence:** large-graph complexity management
(Tier 3) and knowledge-base UI (already a separately queued task) — both
named as follow-on work, not folded in here.

## Risks / non-goals

- This review does not re-litigate `studio-ux-revision-plan.md`'s design
  decisions — it only measures the current gap against them.
- Slice ordering above is a recommendation, not a commitment; sequencing
  against P2's remaining areas (collaboration/review queues, multi-runtime
  compiler targets) is a separate prioritization call.
- Tier 3 (large-graph complexity management) deliberately gets no slice
  breakdown here — it needs its own design pass the way P1 got one,
  not a paragraph inside this review.
