# Large-graph complexity management

Design pass for roadmap P3 "Large-graph complexity management". The pillar comes from `graph-native-control-plane-plan.md` §4, and gap-analysis Tier 3 flagged it as not started.

## Decisions (2026-09-24)

- **Start with understanding, then add structure.** The first wave changes nothing in the graph model or runtime. Grouping and subgraphs follow as separate waves.
- **Subgraphs are graph-as-node** (wave 7c):
  - A node references another saved graph, or a pinned release of it.
  - Its typed interface comes from that graph's input and output nodes.
  - It runs as a nested run with its own trace.
  - It is reusable across graphs and versioned through releases.
  - "Extract selection to graph" creates one from existing nodes.
- **Health is a 0–100 score plus a breakdown,** and every item links to its node.

## Waves

| Wave | Scope | Status |
| --- | --- | --- |
| 7a | Find on canvas, dependency view, blast radius, health score | **Shipped** ([STO-610](https://linear.app/stockwise-productions-prototypes/issue/STO-610)) |
| 7b | Visual groups with collapse and expand; display-only, no runtime change | **Shipped** ([STO-611](https://linear.app/stockwise-productions-prototypes/issue/STO-611)) |
| 7c | Graph-as-node subgraphs: typed interface, nested runs, "Extract to graph" | Planned |
| 7d | Multiple graph views and architecture layers | Planned |

## 7a — what shipped

### Health score

`backend/app/graph_health.py`; `POST /api/graphs/{id}/health` with the draft graph as the body, so unsaved edits count.

The score starts at 100, and each factor subtracts up to its cap:

| Factor | Deduction | Cap |
| --- | --- | --- |
| Blocking errors | 25 each | 50 |
| Warnings | 3 each | 15 |
| Unreachable nodes | 5 each | 15 |
| Dead ends (a non-output node with no out-edge) | 5 each | 10 |
| Untested nodes (never ran in the analytics window) | 15 × fraction | 15 |
| Recent run failure rate | 20 × rate | 20 |
| Complexity (longest path > 12, or fan-out > 5) | 5 each | 10 |

- **Warnings** exclude the compiler's `GRAPH_UNREACHABLE_NODE`, which the Unreachable nodes factor already counts.
- **Untested nodes and failure rate** show "No runs yet" when the graph has no runs.
- **Bands:** healthy ≥85, attention 60–84, at risk <60.
- **Studio:**
  - a header chip coloured by band;
  - a `health` workbench panel listing factors by deduction, where clicking an item focuses its node;
  - the score recomputes about 600 ms after each validation.

### Blast radius

`backend/app/impact.py`; `POST /api/graphs/{id}/nodes/{node_id}/impact` with the draft graph as the body.

It reports:
- downstream nodes, in BFS order;
- outputs reached, and routers/branches downstream;
- the upstream count;
- resources the node pulls in (`bindings.node_bindings`);
- runs that executed it (`node_analytics`);
- every release containing it, and whether the draft has changed it since (`fingerprint.diff_graphs` node deltas);
- saved datasets whose fixtures stub it.

**Studio:** the NodeInspector **Impact** tab lights the node's downstream set on the canvas while it's open.

### Find on canvas

`lib/graphSearch.ts` and `FindBar.tsx`.
- **Opening it:** Ctrl/Cmd+F, the header ⋯ menu, or the tray's More menu.
- **Matching:** id, label, config text, and `type:<nodeType>`. Results rank exact id matches first, then prefix matches, then the rest.
- **Navigation:** Enter and Shift+Enter walk the matches, panning to each. Non-matching nodes dim, and Esc closes the bar.

### Dependency view

`computeFocusNodeIds(nodeId, edges, direction)` now takes a direction: `both`, `upstream` or `downstream`.
- The node context menu offers "Show upstream", "Show downstream" and "Show all dependencies".
- A chip on the canvas shows which view is active, with a Clear button.

### Dimming precedence

When several views are active, the dimming follows the first that applies: find matches, then the Impact highlight, then the dependency view, then focus mode.

## Verification (7a)

- **Backend:** pytest 489/489 (`test_graph_health_impact.py`, 11 tests).
- **SDK:** vitest 112/112.
- **Studio:** vitest 288/288, tsc clean, eslint 0 errors.
- **Playwright** on a live stub backend, at 1440 and 390:
  - The demo graph scores Health 94, Healthy.
  - Adding an orphan prompt dropped the score to At risk, and the Unreachable item named `prompt_2`.
  - Ctrl+F with `type:llm` showed 1 of 2, then 2 of 2 after Enter, with 6 nodes dimmed.
  - "Show downstream" from `llm_classify` showed the chip.
  - The Impact tab reported "reaches 5 nodes · 1 output", with `router_1` under routing and the release marked unchanged.
  - On mobile, the tray's More menu has Find and Health, and both work.

## 7b — what shipped

### Model

- Groups live in a top-level `GraphDefinition.groups: [{id, label, color?, node_ids, collapsed}]` field, not node `extensions` as first sketched.
  - One list is easier to validate, undo and round-trip than membership spread across nodes.
  - Groups are flat: a node belongs to at most one group.
- **Fingerprints:**
  - The semantic fingerprint excludes groups (`_semantic_payload` pops them), so grouping never invalidates a release or replay.
  - The document fingerprint includes `groups` only when the list is non-empty, so the digest of every groupless graph is unchanged.
  - The SDK's `fingerprintGraph` dirty-check includes groups.
- **Compiler warnings** (non-blocking, `structure`): `GROUP_UNKNOWN_NODE` for a missing member, and `GROUP_OVERLAP` for a node in two groups.
- **Studio:** `buildGraphDefinition` prunes deleted members and empty groups before saving.

### Studio (`lib/graphGroups.ts`, `nodes/GroupFrame.tsx`)

**Frames are derived, not stored.** Each render builds `groupFrame` React Flow nodes from `groups` plus member positions, and they never enter `nodes` state. So dagre layout, validation and the saved graph never see them, and after auto-layout the frames simply re-fit.

**On the canvas** (`FlowCanvas` draws `renderNodes`/`renderEdges`; layout, fit and focus still use the graph):
- An expanded frame is a tinted dashed rectangle behind its members.
  - Only its header takes pointer events, so panning and box-selecting inside it still work.
  - Dragging the header moves every member.
- A collapsed group becomes a card showing the label, "N nodes" and a strip of member-type icons.
  - Members are hidden, not removed.
  - Edges crossing the boundary re-attach to the card.
  - Duplicate edges merge into one with a "×N" badge.
  - Double-click expands the card.

**Actions:**
- Group:
  - Ctrl/Cmd+G;
  - node menu → "Group selection (N)" / "Group node";
  - right-click on the selection box.
- A new group opens straight into an inline rename.
- The group menu has Rename, Collapse/Expand, six colour swatches, and Ungroup (Ctrl/Cmd+Shift+G).
- Every action records an undo snapshot; `CanvasSnapshot` gained `groups`.

**Interplay with 7a:**
- Find, Health, diagnostics and the other `focusNode` paths expand the collapsed group holding the target first.
- Find, Impact and dependency dimming also dims frames with no lit members.

**Fixed along the way:** the selection-mirroring effect collapsed React Flow's Ctrl/Cmd+click multi-selection to a single node. It now keeps an existing multi-selection.

## Verification (7b)

- **Backend:** pytest 493/493 (`test_graph_groups.py`: round-trip, warnings, fingerprints).
- **SDK:** vitest 114/114 (schema, and fingerprints matching the backend).
- **Studio:**
  - vitest 298/298: `graphGroups.test.ts` for bounds, membership, reroute and merge, hiding and dimming; `GroupFrame.test.tsx` for toggle, double-click and rename;
  - tsc clean, and eslint 0 errors.
- **Root:** build green.
- **Playwright** on a live stub backend, at 1440 and 390:
  - Ctrl+click `prompt_answer` and `llm_answer`, then Ctrl+G, gave a frame. Renamed it "Answer path" and coloured it violet.
  - Collapse gave the card: the fallback edge goes in, and the edge to output comes out.
  - Saved and reloaded: still collapsed, and the API returned the group.
  - Find `llm_answer` auto-expanded the group.
  - Dragging the header moved the members (+75, +67).
  - Ungroup, then Ctrl+Z, restored the frame.
  - On mobile, the collapsed card renders.
