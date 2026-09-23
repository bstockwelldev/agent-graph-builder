# P1 gaps: draft diff, routing lab vs release, counterfactual replay — shipped ([STO-609](https://linear.app/stockwise-productions-prototypes/issue/STO-609))

This closes the named gaps left on three shipped P1 roadmap rows. It is PR 2 of 2; PR 1 was [configurable policies](configurable-policies.md).

## Decisions (2026-09-23)

- **Replay modes:** forced route, and model swap.
- **Swapped node:** runs live when its provider has credentials, and falls back to the stub otherwise (flagged `stub_fallback`).
- **Affected nodes** (downstream of a change, or newly reached): recompute on the stub by default. With "Run affected nodes live" they use the original run's provider, when that provider is usable.
- **Everything else** stays frozen at its recorded output.

## Draft ↔ release diff

- **Backend:** `releases.compare_draft_to_release(release, draft)`.
  - It uses the same `fingerprint.diff_graphs` as release-vs-release.
  - The draft's resources are resolved live, the way a publish would snapshot them.
- **Diff format:** `ReleaseDiff.to_release_id` is `null` for a draft, and `to_label` is `"Draft"`.
- **Route:** `POST /api/graph-releases/{release_id}/compare-draft`, with the draft `GraphDefinition` as the body. It returns 404 for an unknown release, and 422 when the graph id doesn't match.
- **Studio:** Releases → expand a release → **Diff vs draft**. It sends the live canvas (`buildGraphDefinition`), so unsaved edits count, and shows "Draft (unsaved)".

## Routing lab against a release

- **Backend:** `routing_lab.run_routing_dataset(..., release_resource_snapshots, release_id)` runs the dataset as the release.
- **Route:** `POST /api/graphs/{id}/routing-lab/compare-release/{release_id|latest}`. The release is the baseline and the saved draft is the candidate.
- **Studio:** the Routing lab's "Compare the draft against" control offers **A release** (default: Latest release, or any release from the list) or **Another graph** (the previous id input). Results are labelled "Release (latest) (baseline) → Draft (candidate)".

## Counterfactual replay

`POST /api/runs/{run_id}/replay` takes an optional `ReplayRequest`:

```yaml
forced_routes: {router_or_branch_id: target_node_id}
model_overrides: {llm_or_tool_loop_id: {provider, model?}}
live_affected: false
```

**Validation.** Invalid requests are rejected with 422 `REPLAY_COUNTERFACTUAL_INVALID`:
- the node isn't a router/branch (for a route) or an llm/tool_loop (for a model);
- the target isn't one of the node's out-edges;
- the provider is unknown.

An empty body is the original byte-identical replay.

**Mechanism** (`replay.py`, `runtime.py`, `nodes.py`):
- **Affected set:** the changed nodes plus everything downstream of them (BFS over edges). These are removed from the frozen fixture set. Input nodes are always re-run in a counterfactual, because they populate `state.variables`, which frozen nodes skip and recomputed tools need.
- **`ExecContext.forced_routes`:** `compute_router` / `compute_branch` select the edge to the forced target with `rationale: "forced"`. That value is recorded in `edge.selected` and in the run's route decisions.
- **`ExecContext.node_chat_models`:** a per-node `ChatModel` for swapped nodes, via `_chat_model()` in both `compute_llm` and `compute_tool_loop`.
- **Run provider:** `stub`, unless `live_affected` is set and the original provider is usable. A provider is usable when it needs no key, or has one configured.

**Result:** `CounterfactualResult` extends `SimulateResult`:

```yaml
original_run_id: str
counterfactual: bool
original_traces: [NodeTrace]
changed_nodes: [node_id]
node_modes: {node_id: frozen | recomputed | live | stub_fallback | forced}
```

**Studio** (Run panel → History → **Replay with changes…**):
- The form (`CounterfactualForm.tsx`) offers:
  - per router: "As recorded" or "Force → target";
  - per LLM node: a provider (with "As recorded") and an optional model;
  - a "Run affected nodes live" toggle, with a note that it may cost tokens.
- The result lists every node with a mode chip, plus "Newly reached" / "Not reached" chips. Changed nodes show their original and counterfactual outputs side by side.
- Helper logic lives in `lib/counterfactual.ts`.

## Verification

- **Backend:** pytest 478/478. `test_counterfactual_replay.py` has 16 tests:
  - plain replay;
  - forced route;
  - frozen outputs stay byte-identical;
  - a recomputed tool still sees the run input;
  - stub fallback;
  - live swap;
  - `live_affected`;
  - invalid requests;
  - the route;
  - draft diff;
  - routing vs release, including 404s.
- **SDK:** vitest 109/109.
- **Studio:** vitest 281/281, tsc clean, eslint 0 errors.
- **Playwright on a live stub backend** (1440 and 390):
  - **Diff vs draft:** showed the `llm_answer` model change and the `e_router_tool` condition change.
  - **Routing lab vs the latest release:** `tool_lookup` went 1 → 0 and `prompt_answer` 1 → 2.
  - **Forced route to `tool_lookup`:** shown as Forced route, with recomputed nodes and the real tool answer; 5 nodes changed.
  - **Model swap to Groq with no key:** flagged Stub fallback.
  - **Mobile:** the form fits in the run drawer.
- **Found and fixed during QA:** a recomputed tool read an empty `question`, because the frozen input node skipped setting the variable. The fix is the input-node rule above, covered by a regression test.
