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
| ~~Knowledge base has zero UI anywhere in `apps/studio`~~ **Shipped (PR #44).** | New graph-scoped `knowledge` workbench panel (`components/graph/KnowledgePanel.tsx`): upload/remove `.txt`/`.md` documents and see per-document retrieval usage from the P2 lineage endpoint. SDK gained `getKnowledge`/`uploadKnowledgeDocument`/`deleteKnowledgeDocument`. Found and fixed a backend gap while verifying it live: an embedding-provider failure on upload escaped as a bare 500 instead of a 502 with a readable message. |
| Node inspector isn't part of the panel registry | `NodeInspector`/`EdgeInspector` render as a hand-rolled sibling block outside `WorkbenchDrawer`, mutually exclusive with the `run`/`releases`/`routingLab` panels — inspecting a node while one of those is open costs an extra click to close it first. Not named in either locked doc, but a measured, real friction cost. |

### Tier 2 — `studio-ux-revision-plan.md`'s own Revision Sequence, still open

Section 12 lists 10 items; items 1-3 are done (rail/drawer graph switcher,
rebuilt toolbar, a first-pass selection dock). Items 4-10 were never
claimed shipped — this tier makes their current status explicit rather than
leaving them as an implicit backlog.

| Gap | Evidence |
| --- | --- |
| ~~Selection dock has no Configure/I-O/Policy/Run **tabs**~~ **Shipped (PR #34, Slice B).** | `NodeInspector` is now a Configure/I-O/Policy/Run tabbed dock (`NodeInspector.tsx`), with a node-scoped Policy tab and a "nothing selected" `WorkflowSummary` (node/edge counts, validation summary, entrypoints/terminal nodes, recent runs, quick actions). |
| ~~No node launcher~~ **Shipped (PR #38, Slice C follow-up).** | `FlowCanvasInner` now detects a pane double-click and opens a searchable "Add node" menu (`NodeContextMenu`'s new `searchValue`/`onSearchChange` props), filtered against the 12 node types. |
| ~~No focus mode~~ **Shipped (PR #40, Slice D).** | `computeFocusNodeIds` (`lib/graphFocus.ts`) + a HUD toggle dim any node outside the selected node's ancestor/descendant closure. |
| ~~No typed-port / compatible-target connect feedback~~ **Shipped (PR #39, Slice C follow-up).** | `GraphNodeView.tsx` uses `useConnection()` + `computePortDragCompatibility` (`content/node-ports.ts`, mirroring `contracts.py`'s `_kind_incompatibility`) to highlight/fade target handles during a connection drag. |
| ~~Half of the six named run/debug scopes don't exist~~ **Shipped (PR #36, Slice C first cut).** | "Validate" is now a real labeled action (`RunPanel.tsx`); "Run from selected node" mocks ancestor node outputs via the backend's existing `fixture_node_outputs` mechanism (new `RunRequest.node_outputs`); "Debug run" force-opens the Events trace console. "Run," "Run with fixture," and "Replay run" already existed. |
| ~~Toolbar's "Run ▾" split-button doesn't exist~~ **Shipped (PR #36, Slice C first cut), partially.** | `RunPanel.tsx`'s Execute section now has a "Run ▾" split button (Run / Run from selected node / Run with fixture / Debug run), reusing `NodeContextMenu` as a trigger-anchored dropdown. "Run with production inputs" is excluded, not deferred — no definition of this concept exists anywhere in the codebase or either locked doc; it needs product definition before it can be built. |
| ~~Node cards are missing the "summary" line~~ **Shipped (PR #40, Slice D).** | `lib/nodeDefaults.ts`'s `summaryFor` adds a second config-derived line for node types that have one worth surfacing (llm/tool_loop's provider, tool's input variable, guardrail/rubric's boolean flag). |
| No operational data grids for registries/run history/eval datasets — **partially shipped (Slice D).** | Run history (`/runs/[graphId]`) is now a sortable `Table`. The five resource registries (agents/prompts/tools/mcp/llm-profiles) deliberately stay as card grids — their entries are named, described things, not naturally tabular, and converting all five is a larger visual redesign this remediation didn't make unilaterally. Datasets: **saved Routing Lab datasets shipped (PR #44)** — `FixtureDataset` is a new stored resource with a load/save/update/delete picker in the Routing Lab, and a run-history "Save selected as dataset" action captures real runs (inputs plus frozen node outputs) via `POST /api/datasets/from-runs`. A *scored* eval store (expected outputs, scorers, live-provider runs) is still not built — see the roadmap backlog row. |
| ~~No standardized styling-ownership pass~~ **Shipped (Slice D).** | `apps/studio/AGENTS.md` (new) documents the two-system split (token-styled `components/graph/*` vs. Tailwind/shadcn everywhere else) and the "never mix" rule, citing the precedents this remediation itself set (`ui/Tabs.tsx`, the Run split-button reusing `NodeContextMenu` instead of the unused shadcn `DropdownMenu`). |

### Tier 3 — named elsewhere, not in either primary doc's checklist

| Gap | Evidence |
| --- | --- |
| No large-graph complexity management | **Update 2026-09-24:** designed in [large-graph-complexity-plan.md](large-graph-complexity-plan.md), and wave 7a (find, dependencies, blast radius, health score) has shipped. Groups and subgraphs follow. — `graph-native-control-plane-plan.md` names this as its own strategic pillar — subgraphs with typed interfaces, collapse/expand, dependency search, blast-radius analysis, multiple graph views, a graph health score. Nothing in `studio-ux-revision-plan.md` covers it, and nothing in `apps/studio` implements any part of it. This is a distinct, larger body of work, not a Tier 1/2 remediation item — recommend it stays its own future design pass, the same way `p1-rollout-plan.md` explicitly deferred P2's areas rather than folding them in. |

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

**Slice A — Close constraint violations. Shipped (PRs #30, #32).** Migrated
`/runs/[graphId]`'s snapshot viewer and `/analytics` into HUD panels;
resource-registry HUD panels gained inline edit; the node inspector's
mutual-exclusivity friction with Run/Releases/Routing-lab was resolved.

**Slice B — Selection dock rebuild. Shipped (PR #34).** Configure/I-O/Policy/Run
tabs on `NodeInspector`; node-scoped policy-exception surfacing in the new
Policy tab; the "nothing selected" workflow summary.

**Slice C — Run/Debug/canvas affordances. Shipped (PRs #36, #38, #39).**
A real, labeled "Validate" action; "Run from selected node"; "Debug run";
a double-click + searchable node launcher; typed-port/compatible-target
connect feedback; the Run split-button. "Run with production inputs" was
excluded rather than built — no definition of it exists anywhere.

**Slice D — Lower-priority polish. Shipped (PR #40 + this PR).** Focus
mode, node-card summary line, run-history data grid, and a styling-ownership
doc (`apps/studio/AGENTS.md`). Explicitly **not** done: converting the five
resource registries (agents/prompts/tools/mcp/llm-profiles) from card
grids into data grids — their entries are named, described things better
suited to cards, and a wholesale visual redesign of five working pages is
a larger decision this remediation didn't make unilaterally; flag for a
dedicated design pass if still wanted. Saved and run-captured Routing
Lab datasets shipped in the follow-on PR; a scored eval store did not.

**Explicitly out of this sequence:** large-graph complexity management
(Tier 3), named as follow-on work, not folded in here. The knowledge-base
UI, originally listed here as a separately queued task, has since shipped
(see the Tier 2 row above).

**Status: this remediation sequence is complete** (Slices A-D all
shipped, per above) except the two items named as deliberately not done
in Slice D.

## Risks / non-goals

- This review does not re-litigate `studio-ux-revision-plan.md`'s design
  decisions — it only measures the current gap against them.
- Slice ordering above is a recommendation, not a commitment; sequencing
  against P2's remaining areas (collaboration/review queues, multi-runtime
  compiler targets) is a separate prioritization call.
- Tier 3 (large-graph complexity management) deliberately gets no slice
  breakdown here — it needs its own design pass the way P1 got one,
  not a paragraph inside this review.
