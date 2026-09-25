---
title: RCA + PTR — demo graph contract warnings users couldn't resolve
date: 2026-09-25
status: p1-implemented
severity: P2 (UX — permanent false-positive warnings on the flagship demo)
---

# RCA + PTR — "Classify & Route (demo)" shows 2 warnings with no way to fix them

**Symptom:** The demo graph opens with `⚠ 2` in the header and two entries in Run → Issues:

```text
Warning: 'message' -> 'structured-json' requires an explicit transform or a compatible JSON Schema on both ports   (tool_lookup)
Warning: target port 'input' expects 'message' from a 'tool-result' source; add a format_message transform       (output_1)
```

Nothing in the node or edge inspector can act on either message. The run itself succeeds.

---

## 1. Situated problem

The P0 contract pass (`backend/app/contracts.py`) checks every edge's source port kind against its target port kind. Nodes without author-declared ports get their kinds from the default catalog (`backend/app/ports.py` `_DEFAULT_PORT_CATALOG`):

| Node | Default input | Default output |
| ---- | ------------- | -------------- |
| router | message | message (passthrough) |
| tool | **structured-json** | tool-result |
| output | **message** | — |

So `router → tool` is message → structured-json, and `tool → output` is tool-result → message. Both are flagged as `CONTRACT_KIND_INFERRED_MISMATCH` (non-blocking, because neither side declared ports).

## 2. Evidence

| Probe | Result |
| ----- | ------ |
| `validate_graph(build_demo_graph())` before the fix | Exactly these 2 warnings; the test `test_demo_graph_warns_on_inferred_kind_mismatches` locked them in as expected. |
| `compute_tool` (`backend/app/nodes.py`) | Reads its argument from `state["variables"][config.inputVariable]`. **It never reads the incoming edge's payload.** |
| `compute_output` | Returns `get_upstream_output(...)` unchanged, so any kind is valid. |
| Edge `transform` at runtime | Nothing outside `contracts.py` and `fingerprint.py` reads `edge.transform`. Transforms are **validated but never applied**, although `adapters.py` advertises `deterministic_transforms: supported`. |
| Studio edge inspector | Edits `kind` and `condition` only. There is no transform or port editor. |
| Studio save (`GraphEditor.buildGraphDefinition`) | Rebuilt edges as `{id, source, target, kind, condition}` and nodes without `input_ports`/`output_ports`, so **every save stripped transforms and declared ports** that had been set via API or JSON import. |

## 3. Root cause (summary)

1. **Wrong default contracts.** The catalog gives `tool` and `output` typed inputs, but their executors don't consume the edge payload as typed data. The warnings describe a mismatch that can't happen at runtime.
2. **Advice that can't be acted on.** The warnings say "add a format_message transform" or "declare a compatible JSON Schema". The studio has no UI for either, and saving from the studio erased them even when they were set by other means.
3. **Tests treated the false positives as intended behavior**, so nothing flagged them as a defect.

## 4. Causal chain

Default catalog types tool/output inputs → contract pass compares inferred kinds → 2 non-blocking warnings on every router→tool→output graph → the warning recommends a transform → no UI exists, the save path strips transforms, and the runtime ignores them → the user can't clear the warning, and "2 warnings" becomes permanent noise that hides real issues.

## 5. PTR — resolution plan

### Goal

A warning appears only when the user can do something about it, and whatever it tells the user to set survives a save and has an effect.

### P0 — Correct the contract and stop data loss (implemented in this change)

- `ports.accepts_any_kind(node)`: `tool` and `output` default inputs accept any kind. Author-declared `input_ports` are still checked, and explicit-vs-explicit mismatches still block. `contracts._validate_edges` skips the kind check for these nodes. The demo graph now validates clean.
- The studio round-trips node `input_ports`/`output_ports` and edge `source_port`/`target_port`/`transform` through load and save (`lib/graphAuthoring.ts` `nodePorts`/`edgeContract`), so a save never drops them.
- Tests: `test_demo_graph_has_no_inferred_kind_mismatches`, `test_inferred_kind_mismatch_still_warns_for_consuming_nodes`, and studio `contract round-trip` tests.

### P1 — Make remaining contract warnings actionable (implemented 2026-09-25)

- Kind-mismatch messages now end with the control that fixes them ("select the edge → Transform → Format message").
- **Edge transform editor** in `EdgeInspector` (`components/graph/TransformFields.tsx`): shown for an edge with a transform or a kind-mismatch diagnostic, or on "Add transform"; Inline or Library.
- **Transforms are applied at runtime** in `ports.resolve_node_input` (engine: `backend/app/transforms.py`); a failing transform fails the target node. The capability claim now names where.
- Beyond the original plan, transforms became first-class on two more surfaces: a reusable **Transforms library** (Resources → Transforms, bound by id and pinned in releases) and a **`transform` node** in the palette. See `p0-graph-foundation-design-plan.md` → "Transform surfaces".
- Also fixed: the SDK rejected a graph containing any edge transform (the API sends unset fields as `null`; the schema said optional).

### P2 — Port authoring and display

- An "Advanced → Ports" section in the node inspector to declare ports and schemas (the explicit contract opt-in).
- ~~Node cards show `in: any` for kind-agnostic inputs instead of `in: structured json`.~~ Done 2026-09-25: cards, the I/O tab and connect-drag feedback treat tool/output/transform default inputs as `any` (`content/node-ports.ts` `acceptsAnyKind`).

### Non-goals

- Changing the port-kind vocabulary or the blocking rules for explicit ports.
- Validating tool arguments against a tool's own input schema (a separate feature).

## 6. Key code paths

- `backend/app/ports.py`: `_DEFAULT_PORT_CATALOG`, `accepts_any_kind`, `resolve_node_input`
- `backend/app/contracts.py`: `_validate_edges`, `_kind_incompatibility`
- `backend/app/nodes.py`: `compute_tool`, `compute_output`
- `backend/app/adapters.py`: the `deterministic_transforms` capability claim
- `apps/studio/components/graph/GraphEditor.tsx`: `toFlowNode`, `toFlowEdge`, `buildGraphDefinition`
- `apps/studio/lib/graphAuthoring.ts`: `nodePorts`, `edgeContract`

## 7. Verification

- `cd backend && uv run pytest -q tests/test_contracts.py`
- `validate_graph(build_demo_graph())` returns no diagnostics.
- Studio: open the demo graph. The header shows no warning count, and Run → Issues is empty.
- Import a graph JSON with an edge `transform`, save from the studio, and re-export: the transform is preserved.
