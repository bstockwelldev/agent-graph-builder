---
title: P1 rollout plan — simulation, replay, diffs, routing, and reusable assets
status: proposed
capability: p1-rollout
depends_on:
  - p0-graph-foundation-design-plan.md
  - graph-native-control-plane-plan.md
  - studio-ux-revision-plan.md
linear_issue: none
last_updated: 2026-09-20
---

# P1 rollout plan

> **Status:** Proposed. Sequences the P1 follow-on work the P0 graph
> foundation deliberately deferred; does not itself implement any of it.

## Context

The P0 graph foundation ([p0-graph-foundation-design-plan.md](p0-graph-foundation-design-plan.md))
shipped in four slices — canonical typed ports, contract validation, immutable
releases with LangGraph capability reports, and version-pinned run snapshots —
and is deployed to production. That doc's own Follow-on boundary named what
comes next:

> P1 can add semantic release comparison, fixture simulation, subgraph
> stubbing, replay, reusable assets, and routing experiments. P2 can add
> policies, knowledge lineage, reviews, and selected additional runtime
> adapters. Simulation and replay must consume P0 immutable snapshots and
> the same contract/capability diagnostics; otherwise the product creates
> competing sources of truth.

That last sentence is a hard constraint on everything below: simulation and
replay build on the `GraphRelease` and `RunGraphSnapshot` records P0 already
made durable, and on the existing `Diagnostic` vocabulary (`category`,
`port_id`, `target`, `remediation` from `backend/app/contracts.py`) — not a
parallel model.

`docs/planning/roadmap.md`'s Strategic Roadmap Addendum already lists five of
these six items as P1 capability rows, but none links a design doc the way
the P0 row links `p0-graph-foundation-design-plan.md`. This document is that
design doc.

## Scope

In scope for P1, per the P0 doc's Follow-on boundary and the roadmap
addendum:

- Semantic release comparison
- Fixture-based simulation (including subgraph stubbing, folded in — see
  Slice B)
- Historical replay
- Routing policy lab
- Versioned reusable entity registry (parallel, lower-priority track)

Out of scope for P1 — explicitly deferred to P2 per both the P0 doc and the
roadmap addendum's non-goals: cross-cutting policy overlays, retrieval/
knowledge lineage, collaboration/review/approval queues, and any runtime
adapter beyond the existing `LangGraphAdapter` facade in `backend/app/adapters.py`.

## UX integration constraint: HUD-anchored, not separate pages

**Current gap, confirmed by direct comparison against a reference desktop
graph-builder UI (IBM Langflow Desktop):** that reference keeps every
surface — component config, prompt/context inspection, agent settings —
docked around the canvas as panels in one continuous view; nothing routes
away from the graph. `apps/studio` mostly follows that model already
(`WorkbenchDrawer`'s rail/drawer panels, `ReleasesPanel.tsx` docked beside
`GraphEditor.tsx`), but the run-history and snapshot viewer shipped in the
Studio releases UI work is the one place that breaks it:
`apps/studio/app/runs/[graphId]/page.tsx` is a standalone route the user
navigates *away* from the canvas to reach, not a HUD panel. That is a real,
already-shipped gap against the `studio-ux-revision-plan.md` rail+drawer
model, not a hypothetical one.

This sets a hard UI constraint on every P1 slice below: **no new
standalone pages.** Comparison views (Slice A), fixture/simulation setup and
results (Slice B), replay (Slice C), and routing-lab comparisons (Slice D)
all surface as canvas-anchored HUD panels — new entries in
`apps/studio/components/workbench/panels.ts`'s registry, rendered via the
existing `WorkbenchDrawer`/rail system, the same way `ReleasesPanel.tsx` is
wired into `GraphEditor.tsx` today. Anatomy management (nodes, ports,
resources), observability (run traces, diagnostics), and analytics
(cost/latency, route distributions) should each be reachable in 1-2 clicks
from the canvas HUD without crowding it — favor the existing HUD button +
compact mobile bar pattern and command-palette entries for `scope: "global"`
panels over adding toolbar chrome.

**Follow-on item, tracked here but not part of Slices A–D's exit gates:**
migrate the existing `/runs/[graphId]` page into a HUD panel (e.g. a
`"runs"` panel id alongside `"releases"`) as part of Slice A or as a
standalone pre-Slice-A cleanup — whichever the implementer picks, it should
land before Slice C (replay) adds more run-surface UI on top of a page this
constraint says should not exist.

## Slice breakdown

Sequenced by dependency and by how much existing P0 code each slice reuses —
lowest-risk, most-reuse first.

### Slice A — Semantic release comparison

The natural first slice: no new runtime or execution concept, and it reuses
the canonical normalized-JSON payload builders P0 already wrote for
fingerprinting (`backend/app/fingerprint.py`'s `_document_payload`,
`_semantic_payload`, `_release_document_payload`, `_release_semantic_payload`)
plus `backend/app/releases.py`'s `get_release`/`list_releases`.

Adds:
- A diff function that compares two `GraphRelease`s' semantic payloads and
  produces categorized deltas (node config changes, edge/router threshold
  changes, port/contract changes), not a raw JSON diff — matching the P0
  doc's own "semantic diffs should explain behavior changes, not raw JSON
  changes" framing from `graph-native-control-plane-plan.md` Section 4.
- `GET /api/graph-releases/{release_id}/compare/{other_release_id}`.
- SDK schema + `client.compareReleases(...)` method.
- A Studio diff view reachable from `ReleasesPanel.tsx`'s existing release
  history list (select two entries, compare).

Exit gate: comparing a release against itself returns an empty diff;
comparing two releases with a single node config change returns exactly one
categorized delta.

### Slice B — Fixture-based simulation (subsumes subgraph stubbing)

New `Fixture` model: declared graph inputs plus optional per-node
mocked/recorded outputs. A simulate pipeline runs a `GraphRelease` or draft
snapshot through static validation → mock/recorded node output → router-
decision simulation → contract propagation, without calling live tools or
LLMs.

Reuses two existing precedents instead of inventing stubbing from scratch:
- `backend/app/providers/stub.py`'s deterministic Stub provider convention
  (already used for `CHAT_PROVIDER=stub` mode).
- `backend/app/nodes.py`'s `compute_tool` mock-echo fallback for a `tool`
  node with no `mcp_server_id`/`mcp_tool_name` bound (`{"toolId": ..., "note":
  "mock tool: no MCP binding registered"}`).

Both get generalized into a fixture-driven per-node override rather than
staying a single node-type special case. "Subgraph stubbing" is not a
separate slice — the design doc it comes from
(`graph-native-control-plane-plan.md`) never elaborates it as its own
pillar; here it is one fixture-override mode (mock one node or a connected
subset while the rest of the graph runs normally).

This slice fills the `studio-ux-revision-plan.md` Section 9 "Run with
fixture" UI slot — already named in that locked doc, not yet implemented.

Exit gate: simulating the demo graph with a fixture that stubs its tool node
produces the same contract diagnostics a live run would, with no live tool
call made.

### Slice C — Historical replay

Built directly on P0's `RunGraphSnapshot` durability guarantee
(`storage.get_run_graph_snapshot`, already immutable and correctly
release/draft-pointer-scoped). Replay opens a past run's exact snapshot
read-only — the `studio-ux-revision-plan.md` "Replay run" slot ("Opens
immutable workflow version in read-only execution mode").

First cut: replay with the run's original inputs and its captured tool
outputs frozen — no re-execution against live tools or models.

**Naming collision to resolve before implementing:** `backend/app/runtime.py`'s
human_gate resume path already sets `"replayed": True` on re-emitted
`NodeTrace` events — that is resume bookkeeping for a paused run, an
unrelated concept to historical replay of a completed run. Keep that
trace-level flag as-is and give this feature its own vocabulary (e.g.
`POST /api/runs/{run_id}/replay`) so the two are never conflated in code,
diagnostics, or the API surface.

Counterfactual replay modes (swap model, router policy, retriever profile;
freeze all nodes but one) are named here as later P1 follow-on work within
this slice, not built in the first cut.

Exit gate: replaying a completed run reproduces its recorded node outputs
exactly, with zero live provider/tool calls made.

### Slice D — Routing policy lab

Depends on Slice B's fixture-driven batch execution: `graph-native-control-plane-plan.md`
Section 4 describes the routing lab as comparing routing versions "over
fixture datasets," which requires a simulation engine to already exist.

Extends `backend/app/nodes.py`'s `compute_router`/`compute_branch` (today
pure rule-based substring/classification matching, no strategy abstraction)
and `backend/app/runtime.py`'s `route_decisions` state channel (append-only,
but only ever replayed as "the latest decision" for LangGraph's conditional-
edge API — no cross-run aggregation exists today).

Exit gate: running the same graph against a fixture dataset twice, with one
router threshold changed, produces a route-distribution comparison between
the two runs.

### Reusable entity registry (parallel track, not a numbered slice)

Named in the roadmap addendum as P1 but rated Medium impact/"Scale," versus
Slices A–D's High/"Differentiator" rating. Nothing above depends on it — P0's
`resolve_resource_snapshots` deliberately avoided needing a versioned
registry (see p0-graph-foundation-design-plan.md's resource-reproducibility
section). Track this in parallel, lower priority than A–D.

Extends `backend/app/resource_models.py`'s `RESOURCE_MODELS` registry and
`backend/app/storage.py`'s single `resource(kind, id, payload_json)` table
(currently `insert ... on conflict(kind, id) do update` — destructive
overwrite) with an immutable version/history table, mirroring the
`graph_release_index`/`graph_release_payload` shape already used for
releases.

**Credential caveat, restated from the P0 doc:** no `RESOURCE_MODELS` entry
may gain an auth/secret field without excluding it from any snapshot
mechanism (this registry's or P0's `resource_snapshots`) first, or encrypting
it separately.

## Risks / non-goals

| Risk | Mitigation |
| --- | --- |
| P1 expands into P2 | Exclude policy overlays, knowledge/retrieval lineage, review/approval queues, and any second runtime adapter from all slices above. |
| Simulation/replay create a second source of truth | Both must read `GraphRelease`/`RunGraphSnapshot` and reuse `contracts.py`'s `Diagnostic` vocabulary; no parallel snapshot or diagnostic model. |
| Fixture stubbing changes ordinary run behavior | `compute_tool`'s existing mock-echo fallback for unbound tools must be unchanged for non-fixture runs; fixture overrides are additive and only active when a fixture is supplied. |
| Replay/resume terminology collision | Keep `runtime.py`'s human_gate `"replayed"` trace flag as-is; give historical replay its own route/vocabulary (see Slice C). |
| Routing lab built before simulation exists | Sequence D after B; do not start D's batch-comparison work until B's fixture execution engine is in place. |
| New P1 surfaces regress to standalone pages (the `/runs/[graphId]` gap) | Every P1 UI addition ships as a HUD/rail/drawer panel via `apps/studio/components/workbench/panels.ts`, never a new top-level route; migrate `/runs/[graphId]` into a HUD panel no later than Slice A. |

## Related docs

- [P0 graph foundation design](p0-graph-foundation-design-plan.md)
- [Graph-native control plane plan](graph-native-control-plane-plan.md)
- [Studio UX revision plan](studio-ux-revision-plan.md)
- [Roadmap](../roadmap.md)
