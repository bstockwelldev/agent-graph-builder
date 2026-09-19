---
title: P0 graph foundation - technical design plan
status: proposed
capability: p0-graph-foundation
linear_issue: none
created_at: 2026-09-19
last_updated: 2026-09-19
depends_on:
  - graph-native-control-plane-plan.md
  - studio-ux-revision-plan.md
---

# P0 graph foundation - technical design plan

> **Status:** Proposed implementation design.
> **Scope:** The first shippable foundation for a typed, versioned, LangGraph-executable graph product.
> **Out of scope:** Semantic review, fixture simulation, replay variants, reusable entity versioning, routing experiments, multi-runtime deployment, and enterprise approval workflows. Those are P1 or later.

## Goal

Move Agent Graph Builder from a mutable visual-workflow POC to a graph-native engineering workspace without breaking existing saved graphs, Studio authoring, or the LangGraph execution path.

```text
Studio draft
    -> typed canonical graph IR
    -> structural + contract + target-capability validation
    -> immutable release snapshot
    -> LangGraph compilation and run
    -> version-pinned run timeline on the graph
```

At completion, an engineer can identify the exact graph release a run used, see whether every connected boundary is compatible, understand why a graph cannot compile to LangGraph, and inspect the run path on that release.

## P0 decisions

| Decision | P0 choice | Why |
| --- | --- | --- |
| Canonical artifact | A versioned, typed graph IR owned by Agent Graph Builder | The graph, rather than a LangGraph implementation, is the product artifact. |
| Compatibility | Existing `GraphDefinition` remains accepted as a legacy draft input | Saved POC graphs and both apps continue working while the new IR arrives. |
| Version model | Mutable draft plus immutable, content-addressed release snapshots | Supports reproducible runs without prematurely building branches or reviews. |
| Contract vocabulary | Built-in port kinds plus optional JSON Schema | Gives visible, useful checks now without requiring a schema registry. |
| Validation | One report for structural, contract, policy-readiness, and target-capability diagnostics | Studio needs one authoritative answer for “can I release/run this?” |
| Runtime scope | LangGraph is the sole executable target and first adapter | Proves the adapter boundary without a false multi-runtime promise. |
| Policy scope | Policy-ready metadata and categories, but no policy authoring UI | Prevents a second incompatible graph model later. |
| Run identity | Store graph/release IDs, fingerprint, target, and compiler version | Historical runs must remain interpretable after draft changes. |
| Runtime dataflow | Per-port node output state (`node_outputs[node_id][port_id]`), resolved/projected by one shared module (`backend/app/ports.py`) used by both contract validation and the LangGraph adapter | Keeps port contracts true at execution time, not only at validation time. |
| Release resource reproducibility | Releases embed deep-copied snapshots of every currently live-resolved resource (`tools`, `mcp_servers`, per-graph `knowledge`) at publish time; no resource versioning system | Makes the reproducibility promise literally true for what nodes actually resolve today, without building the P1 entity registry. |
| Release identity | Separate `document_fingerprint` (full payload) and `semantic_fingerprint` (execution-relevant subset); publish is idempotent on `semantic_fingerprint` alone | Distinguishes literal artifact identity from reproducibility identity without a review/branch model. |
| Run graph durability | Every run persists an immutable `RunGraphSnapshot` (full graph for draft-sourced runs, release pointer for release-sourced runs) at `run_graph_snapshots/{run_id}.json`, retained indefinitely, never cascade-deleted with the graph | Historical run inspection must survive draft edits and graph deletion. |

## Current state and migration constraints

The POC currently uses a mutable `GraphDefinition` with `nodes`, `edges`, `entry_node_id`, and untyped `config`. `backend/app/compiler.py` validates topology and selected configuration, `backend/app/runtime.py` compiles directly to LangGraph, and a persisted `RunSummary` plus `NodeTrace` lets Studio paint historical execution paths.

P0 preserves the twelve current node types and executors, graph CRUD routes and SDK methods, existing SQLite/Blob/object-store/Turso records, SSE event names, Studio run inspection, and the Playground until its planned cutover. A graph with no explicit ports is normalized using node-type defaults and only warned when an inferred contract is too broad to verify. Existing graphs are never silently converted into published releases.

## Canonical graph IR

### Artifact hierarchy

```text
Graph
  id, name, ownership metadata
  |
  +-- Draft (mutable working copy)
  |     canonical GraphSpec
  |
  +-- Release 1 (immutable snapshot)
  |     canonical GraphSpec + fingerprint + validation report
  |
  +-- Release 2 (immutable snapshot)
        canonical GraphSpec + fingerprint + validation report
```

`Graph` is the stable project identity. `Draft` is the current authoring state. A `GraphRelease` serializes the complete canonical graph and release metadata; it never points back to mutable node or resource records. Named branches, pull requests, reviewers, and entity-level releases are P1 additions over this primitive.

### Portable core model

The P0 model extends the existing wire shape rather than replacing it. API and SDK field names remain snake_case.

```ts
type PortKind =
  | "message"
  | "structured-json"
  | "documents"
  | "decision"
  | "artifact"
  | "tool-result"
  | "approval"
  | "error";

type DataClassification = "public" | "internal" | "confidential" | "restricted";

interface PortContract {
  kind: PortKind;
  schema?: Record<string, unknown>;
  required?: boolean;
  classification?: DataClassification;
}

interface GraphPort {
  id: string;
  name: string;
  direction: "input" | "output";
  contract: PortContract;
}

interface GraphNodeV2 {
  id: string;
  type: NodeType;
  position: NodePosition;
  config: Record<string, unknown>;
  input_ports?: GraphPort[];
  output_ports?: GraphPort[];
  extensions?: Record<string, unknown>;
}

interface GraphEdgeV2 {
  id: string;
  source: string;
  source_port?: string;
  target: string;
  target_port?: string;
  kind: EdgeKind;
  condition?: string | null;
  transform?: EdgeTransform;
  extensions?: Record<string, unknown>;
}
```

`extensions` is a namespaced location for target-specific features. P0 supports `extensions.langgraph` only for compile-time capability reporting; ordinary portable graph execution never depends on it.

### Default port catalog

The system derives defaults for the current taxonomy. Authors may override names, schemas, and classifications, but cannot change a port direction or remove a port required by an executor.

| Node type | Default input | Default output |
| --- | --- | --- |
| `input` | none | `message` |
| `prompt` | `message` | `message` |
| `llm` | `message` | `message` |
| `tool` | `structured-json` | `tool-result` |
| `router`, `branch` | `message` | `passthrough` (`message`, default) · `decision` (`decision`) |
| `guardrail`, `rubric` | `message` | `message` — second `error` port deferred to P1; P0 surfaces violations via `node.failed`/diagnostics only |
| `human_gate` | `approval` | `approval` |
| `tool_loop` | `message` | `message` — second `tool-result` port deferred to P1 |
| `code_exec` | `structured-json` | `artifact` — second `error` port deferred to P1 |
| `output` | `message` | none |

Current executors that accept loose dictionaries or strings are normalized behind this boundary; P0 does not rewrite executor internals solely to change native value shapes. The `error`/`tool-result` second ports on `guardrail`/`rubric`/`tool_loop`/`code_exec` are deferred rather than declared now, because none of those executors actually populate a second output today — declaring an unenforced port would repeat the exact mistake this document elsewhere warns against ("never claim a guarantee the runtime doesn't enforce," see Compatibility rules).

### Runtime dataflow model

Port contracts above are a validation-time concept only until the runtime state actually carries values per port. Without this, contract validation could certify a graph as compatible while execution silently ignores which port a value came from — confirmed against the current implementation: `RunState.node_outputs` (`backend/app/runtime.py:48-51`) is `dict[node_id, Any]`, one raw value per node with no port or edge keying, and `get_upstream_output` (`backend/app/nodes.py:113-124`) hands that single value to whichever node reads it next.

P0 makes `node_outputs` port-keyed and adds one shared resolution/projection layer used by **both** the contract validator and the LangGraph adapter, so the validator can never certify something execution doesn't actually do:

```ts
// RunState.node_outputs, extended:
node_outputs: Record<node_id, Record<port_id, unknown>>   // was Record<node_id, unknown>
```

New module `backend/app/ports.py`:

- `default_input_port(node)` / `default_output_port(node)` — resolve a node's port id from explicit `input_ports`/`output_ports`, or the Default port catalog above.
- `resolve_node_input(node, input_port_id, state, graph)` — finds the incoming edge bound to that port whose source already produced a value, and applies the edge's `transform` if present. `get_upstream_output` becomes a thin wrapper calling this with the node's default input port; behavior-preserving today, since every current node type declares exactly one input port.
- `project_node_output(node, resolved_inputs, raw_output)` — maps an executor's native return value onto the node's declared output ports. Default: one output port, wrap the raw value verbatim. `router`/`branch` use an explicit projection (below). Executors in `nodes.py` are unchanged; only the runtime glue's write side moves from writing `output` directly to calling `project_node_output`.

**Multi-input-edge merge rule:** more than one edge may target the same `(node, input_port)` pair only when they are sibling conditional/default edges off one router/branch node — mutual exclusivity is then guaranteed by construction, since exactly one such edge's target runs per `route_decisions` entry. Any other convergence (e.g. two plain `sequence` edges, or edges from two different routers) is a new blocking contract diagnostic, `NODE_INPUT_PORT_AMBIGUOUS_BINDING`. If it ever occurs anyway on an unvalidated draft run, `resolve_node_input`'s declared-edge-order fallback is the defined, non-silent runtime behavior, and the adapter emits a `CONTRACT_RUNTIME_AMBIGUOUS_INPUT` note.

**Router and branch: separating control from data.** Today `compute_router` (`backend/app/nodes.py:268-277`) returns `{"classification": ..., "selectedTargetNodeId": ..., "rationale": ...}` as its *entire* node output, and the runtime writes that dict straight into `node_outputs[node.id]` (`backend/app/runtime.py:222-223`). Any node downstream of a router then reads that decision dict — `str()`-coerced — as its own input (e.g. `compute_llm`, `nodes.py:145-159`, feeds it to the LLM as the user prompt) instead of the message that was actually routed. `compute_branch` (`nodes.py:318-386`) has the identical shape. Route *selection* — which edge fires — is already correct and independent, threaded through `route_decisions`/`_make_route_decision_path_fn` (`runtime.py:144-156`); only the value channel is broken.

`router`/`branch` output projection fixes this by splitting control from data onto two named output ports, with no change to `compute_router`/`compute_branch`/`compute_llm` themselves — only the projection layer:

```python
def _project_router_like(node, resolved_inputs, raw_output):
    return {
        "passthrough": resolved_inputs["message"],  # the node's own resolved input, verbatim —
                                                       # not the classification dict it computed
        "decision": raw_output,                       # the classification/decision dict, unchanged
    }
```

An ordinary downstream edge (no explicit `source_port`) now defaults to `passthrough` and receives the original message. An edge that explicitly wants the decision object (e.g. an audit/logging consumer) sets `source_port: "decision"`. This is orthogonal to `EdgeKind`/`condition` matching (`models.py:63-65`), which stays exactly as it is today: `source_port`/`target_port` is the data axis, `kind`/`condition`/`route_decisions` is the control axis, riding the same edge object independently.

### Edge transforms

An edge can include one explicit, declarative transform:

- `select`: extract a JSON Pointer field from structured input.
- `wrap`: wrap a scalar under a named object field.
- `format_message`: convert a structured object to a templated message.
- `coerce`: approved primitive coercions such as string to number.

Transforms are validation-visible and deterministic. Arbitrary JavaScript/Python transforms, prompt-generated transforms, and hidden coercions are out of scope. A missing compatible transform is a blocking release diagnostic, not an implicit runtime guess.

## Releases and fingerprinting

### Lifecycle

```text
save draft -> validate -> publish release -> compile release -> run release
                  |              |                  |
                  |              |                  +-- capability report stored with compile record
                  |              +-- immutable graph snapshot + fingerprint
                  +-- no publish on blocking diagnostics
```

Publishing is explicit. It creates a release only when selected-target blocking diagnostics are clear. Saving a draft remains lightweight and may contain errors or warnings.

P0 permits running a valid draft as a convenience. Before compiling, the server durably persists a `RunGraphSnapshot` of the exact normalized graph (and its resolved resource bindings) about to run, at `run_graph_snapshots/{run_id}.json`, and labels the run `source: "draft_snapshot"`. This snapshot is immutable and permanent from the moment it is written — "draft" describes that it did not go through publish/validation-gated release, not that it is temporary. It is not a published release and never appears in `GET /api/graphs/{id}/releases`. Environment promotion is not P0 scope.

P0 retains all `run_graph_snapshots` records indefinitely; there is no TTL or automatic pruning. Revisit only if storage metrics show it's warranted — no P0 action item beyond this statement. `storage.delete_graph(graph_id)` deletes only the `graph` (draft) record — already true today (`backend/app/storage.py:452-466`, which touches only the `graph` table/key) — and must never cascade to `run`, `run_node_trace`, `run_graph_snapshots`, or `graph_releases` rows for that `graph_id`. Historical run inspection for a deleted graph must not depend on `GET /api/graphs/{id}` succeeding.

### Resource reproducibility

A release is only genuinely reproducible if everything a run resolves is captured in it. Checked against the current implementation, it isn't yet: `compute_tool` resolves `tools`/`mcp_servers` by *live* `storage.get_resource(kind, id)` calls made at node-execution time (`backend/app/nodes.py:194-218`), and knowledge augmentation resolves a per-graph `knowledge` resource the same way. The generic resource store backing these (`backend/app/storage.py:486-540`, models in `backend/app/resource_models.py`) has no version field at all — `save_resource` is a destructive `(kind, id)` overwrite. So today, editing a bound tool or MCP server after publishing a release silently changes what that release actually does when run — the opposite of reproducible.

P0 closes this by embedding resolved copies of exactly the resource kinds nodes resolve live today — `tools`, `mcp_servers`, and per-graph `knowledge` — into the release at publish time. This is deliberately narrower than a P1-style versioned entity registry (already excluded from P0 by this document's own Follow-on boundary): no revision IDs, no history, no new browsing/diff API, no change to `storage.py`'s resource table — just a one-shot deep copy captured when a release is published.

```ts
interface GraphRelease {
  // ...existing fields...
  resource_snapshots: Record<`${kind}:${id}`, Record<string, unknown>>;
}
```

At publish time: resolve every `tool` node's bound `tools` entry (and, transitively, its `mcp_servers` entry if `mcp_server_id` is set), and the graph's `knowledge` resource if present; deep-copy each resolved payload into `resource_snapshots`. A reference that doesn't resolve blocks publish with a new diagnostic, `RELEASE_RESOURCE_UNRESOLVED`, rather than shipping a release that silently isn't reproducible. Builtin tools (`lookup_topic`, web search, calculator) are code, not stored resources, and stay excluded — they're already versioned via `compiler_version` on `GraphRunIdentity`.

At runtime, `ExecContext` gains `release_resource_snapshots: dict | None`, set only for `source: "release"` runs. `compute_tool` and the knowledge-augmentation call site resolve through a small helper that checks the snapshot first and falls back to live `storage.get_resource` only when the field is `None` (draft-sourced runs — unchanged behavior, still live resolution as today). No executor's control flow changes shape.

Neither `ToolDefinition` nor `McpServerConfig` stores credential material today (`resource_models.py`), so embedding verbatim copies is safe now. If a P1+ change adds an auth/secret field to either model, it must be excluded from `resource_snapshots` (or encrypted separately) before this embedding design is reused.

### Fingerprint

A release needs two distinct identities: the literal artifact as published, and what it will actually do when run.

```ts
interface GraphRelease {
  // ...
  document_fingerprint: string;   // SHA-256 over canonical JSON of the full release payload —
                                   // name, canvas position, release_notes, author, graph,
                                   // resource_snapshots. Identifies this literal artifact record.
  semantic_fingerprint: string;   // SHA-256 over execution-relevant content only: configs,
                                   // normalized ports, edges, transforms, portable extensions,
                                   // AND resource_snapshots — excluding display-only timestamps,
                                   // graph name, canvas position, release notes, and author
                                   // metadata. Identifies "what will actually run."
}
```

`resource_snapshots` is included in **both** fingerprints, not only `document_fingerprint`: swapping a bound tool changes execution behavior even when a graph's own nodes and edges are byte-identical, so two releases with different tool bindings must not collide on `semantic_fingerprint`. Moving a node must not invalidate runtime reproducibility, so canvas position stays excluded from `semantic_fingerprint` as before.

Publishing is idempotent, keyed solely on `semantic_fingerprint`: if an existing release for this `graph_id` already has the candidate's `semantic_fingerprint`, no new release is created — the server returns the existing release (`created: false` in the response envelope) even if cosmetic fields like name, canvas position, release notes text, or author differ from the draft being published. `document_fingerprint` is read/audit-only and never gates release creation or dedupe. There is no P0 mechanism to attach new release notes/author metadata to an unchanged semantic release; that is P1 scope.

### Persistence and API

Use the existing `backend/app/storage.py` abstraction with equivalent logical structures across every backend:

```text
graphs/{graph_id}.json                        # existing mutable draft, migrated in place
graph_releases/{graph_id}/{release}.json
graph_release_index/{graph_id}.json           # release IDs, fingerprints, timestamps
run_graph_snapshots/{run_id}.json             # graph identity + resource bindings captured at run start
```

`run_graph_snapshots` is deliberately named apart from the codebase's existing "run snapshot" (`storage.save_run_snapshot()`, `RunSummary` + `NodeTrace`s — the *execution outcome*, `backend/app/storage.py`), which is a different, already-shipping concept this document does not change:

```ts
interface RunGraphSnapshot {
  run_id: string;
  graph_id: string;
  source: "release" | "draft_snapshot";
  graph_fingerprint: string;                       // the semantic_fingerprint (see Fingerprint) — identity
                                                     // of what actually ran, not the literal artifact record
  release_id?: string;                            // set only when source == "release"
  graph?: NormalizedGraphSpec;                     // set only when source == "draft_snapshot"
  resource_snapshots?: Record<string, unknown>;    // set only when source == "draft_snapshot"
  created_at: string;
}
```

A release-sourced run gets a thin pointer (`release_id` + `graph_fingerprint`, no content duplication — the `GraphRelease` itself is already immutable and durable). A draft-sourced run gets the full embedded graph and its resolved `tools`/`mcp_servers`/`knowledge` bindings, because there is no other durable, immutable record of that exact draft state once the mutable `Draft` keeps changing underneath it.

SQLite/Turso should use release-index and release-payload tables, rather than an unbounded release array in `graphs`. Blob/object-store uses corresponding immutable keys. Missing release indexes must be tolerated for legacy graphs.

| Endpoint / SDK method | Purpose |
| --- | --- |
| `GET`/`PUT /api/graphs/{id}/draft` | Read/save editable graph; current graph routes stay aliases during migration. |
| `POST /api/graphs/{id}/validate` | Validate a draft or supplied release target. |
| `POST /api/graphs/{id}/releases` | Publish an immutable release after validation. Idempotent by `semantic_fingerprint`: republishing an unchanged graph returns the existing release rather than creating a duplicate. |
| `GET /api/graphs/{id}/releases` | List compact release metadata. |
| `GET /api/graphs/{id}/releases/{release_id}` | Fetch exact immutable snapshot. |
| `POST /api/graph-releases/{release_id}/compile` | Compile a release for `langgraph`. |
| `POST /api/graph-releases/{release_id}/runs` | Run an immutable release. |

Legacy graph compile/run routes normalize the draft to a snapshot internally until both frontends are release-aware.

## Validation design

### One report, four passes

Validation becomes a pure pipeline wherever possible. Resource resolution is supplied as context by the route layer, leaving graph checks deterministic and unit-testable.

```text
normalize legacy graph
       -> structural pass
       -> contract pass
       -> policy-readiness pass
       -> target capability pass
       -> ValidationReport
```

| Pass | P0 checks | Blocks release/run? |
| --- | --- | --- |
| Structural | Entry node, edge references, reachability, cycles, router fallback, node configuration | Existing behavior remains authoritative. |
| Contract | Port existence/direction, kind compatibility, basic JSON Schema compatibility, transform validity, required input coverage | Yes for incompatible or unbound required ports. |
| Policy-readiness | Classification known where restricted data is declared; external-tool metadata sufficient for later governance | Warning unless a hard safety constraint applies. |
| Target capability | Node/edge/transform supported by LangGraph; executor and resource binding available | Yes for unsupported runtime behavior. |

### Diagnostics contract

Extend `Diagnostic`, retaining existing fields/codes where possible:

```ts
interface Diagnostic {
  severity: "error" | "warning" | "info";
  category: "structure" | "contract" | "policy" | "capability";
  code: string;
  node_id?: string;
  edge_id?: string;
  port_id?: string;
  target?: "langgraph";
  message: string;
  remediation?: string;
  blocking: boolean;
}
```

Initial stable blocking codes: `EDGE_SOURCE_PORT_NOT_FOUND`, `EDGE_TARGET_PORT_NOT_FOUND`, `EDGE_PORT_DIRECTION_INVALID`, `EDGE_CONTRACT_KIND_INCOMPATIBLE`, `EDGE_SCHEMA_INCOMPATIBLE`, `EDGE_TRANSFORM_INVALID`, `NODE_REQUIRED_INPUT_UNBOUND`, `NODE_INPUT_PORT_AMBIGUOUS_BINDING` (more than one non-sibling edge binds the same input port with no runtime exclusivity guarantee — see Runtime dataflow model), `RELEASE_RESOURCE_UNRESOLVED` (a `tool`/`mcp_servers`/`knowledge` reference a release must embed cannot be resolved — see Resource reproducibility), and `LANGGRAPH_CAPABILITY_UNSUPPORTED`.

### Compatibility rules

- Equal port kinds are compatible, subject to schema checks.
- `tool-result`, `artifact`, and `structured-json` are compatible only with an explicit transform or compatible JSON Schema.
- `message` accepts non-message sources only through `format_message`.
- JSON Schema support begins with `type`, `required`, `properties`, `items`, and `enum`; unsupported keywords warn rather than producing a false compatibility claim.
- A source with no schema and a target schema produces `CONTRACT_SCHEMA_UNKNOWN`, unless a required target must be explicitly marked permissive.

This validator must never claim a transform or schema guarantee that the runtime does not enforce.

## LangGraph adapter boundary

Create an adapter interface before moving compiler logic:

```python
class RuntimeAdapter(Protocol):
    target_id: str

    def capabilities(self) -> CapabilityMatrix: ...
    def validate(self, graph: NormalizedGraphSpec) -> list[Diagnostic]: ...
    def compile(self, graph: GraphRelease) -> CompiledWorkflow: ...
```

`LangGraphAdapter` is the only P0 implementation. Existing `runtime.py` logic moves behind it without altering executor semantics. `compiler.py` coordinates normalization, shared validation, target diagnostics, and the compile record tied to a `release_id` and fingerprint.

| Portable feature | LangGraph P0 support | Notes |
| --- | --- | --- |
| Sequence, conditional, default edges | Supported | Retains current router/branch behavior. |
| Default ports and contract validation | Supported | Enforced at graph boundaries and before executor dispatch. |
| Deterministic transforms | Supported | Applied by generated adapter wrappers. |
| Current 12 executors | Supported | Uses existing executor registry. |
| Human-gate pause/resume | Supported with warning | Process-local pause state emits `DURABLE_CHECKPOINT_UNAVAILABLE` until persistence exists. |
| Cycles, unbounded loops, parallel fan-out | Unsupported | Capability or existing structural error. |
| Target-specific extension nodes | Unsupported | Explicit capability error. |

Expose the matrix at `GET /api/runtime-targets/langgraph/capabilities` and show it in Studio only when a user encounters a capability diagnostic.

At runtime, validate edge input before a target executor and output after completion. A failure emits a structured `CONTRACT_RUNTIME_VIOLATION` in a `node.failed` event and `NodeTrace`. Do not serialize raw untrusted data into diagnostics; store only contract ID, expected summary, actual type, and redacted field path.

## Version-pinned runs and Studio UX

Extend each run with:

```ts
interface GraphRunIdentity {
  graph_id: string;
  graph_release_id?: string;
  graph_fingerprint: string;   // the semantic_fingerprint (see Fingerprint) — identifies what actually ran
  source: "release" | "draft_snapshot";
  runtime_target: "langgraph";
  compiler_version: string;
}
```

The event-first timeline retains current node and edge events. Add `run.snapshot_created`, `run.compilation_started`, `run.compilation_completed`, `contract.validated`, and `contract.violation` only as real state becomes available.

Following [studio-ux-revision-plan.md](studio-ux-revision-plan.md), P0 Studio work is intentionally local to the current graph surface:

1. Toolbar: draft state, validation state, runtime target, and latest published release.
2. Node inspector: compact input/output Contract section, with inferred defaults clearly labeled.
3. Edge inspector: source contract, transform, target contract, and exact diagnostics; canvas edge issue treatment.
4. Publish: disabled for blocking validation and identifies release fingerprint prefix plus target result.
5. Run history: labels the release or draft snapshot used; opening it presents the exact snapshot in read-only inspection mode.

The graph remains the center of work: no permanent validation modal, separate node editor, or second canvas.

## Delivery sequence

### Slice A: Canonical model and compatibility

- Add Pydantic/Zod schemas for ports, contracts, transforms, release metadata, and run identity.
- Implement legacy normalization with default ports.
- Add stable serialization/fingerprint tests and storage primitives for releases.
- Define the per-port `RunState.node_outputs` shape and the shared `ports.py` resolution/projection layer (`resolve_node_input`, `project_node_output`, `default_input_port`/`default_output_port`). Add `document_fingerprint`/`semantic_fingerprint` fields and canonical-JSON rules for both.

**Exit gate:** Existing demo graphs load, validate structurally, compile, and run as draft snapshots unchanged.

### Slice B: Contract validation and canvas feedback

- Split validation passes and introduce extended diagnostics.
- Validate ports, direction, kind, basic JSON Schema, required inputs, and transforms.
- Surface node/edge diagnostics in Studio while preserving Playground compatibility.
- Wire `router`/`branch` default output ports (`passthrough`, `decision`) through `project_node_output`; add the `NODE_INPUT_PORT_AMBIGUOUS_BINDING` contract check.

**Exit gate:** Incompatible edges block publish/run, explain themselves at the edge, and have backend, SDK, and Studio coverage.

### Slice C: Immutable releases and capability reports

- Add draft/release API and SDK methods.
- Publish immutable snapshots after clean LangGraph capability validation.
- Extract `LangGraphAdapter` from compiler/runtime logic.
- Resolve and embed `resource_snapshots` (`tools`, `mcp_servers`, per-graph `knowledge`) into published releases; block publish on `RELEASE_RESOURCE_UNRESOLVED`; add `ExecContext.release_resource_snapshots` and thread it through `compute_tool` and knowledge augmentation. Implement publish idempotency on `semantic_fingerprint`.

**Exit gate:** Editing a draft cannot change a published release or a run started from it.

### Slice D: Version-pinned execution timeline

- Capture run identity at creation and safe contract lifecycle events.
- Update historical inspection to open release snapshots read-only.
- Add API migration notes.
- Persist `RunGraphSnapshot` (full for draft-sourced runs, pointer for release-sourced runs) at `run_graph_snapshots/{run_id}.json` for every run; remove "ephemeral" framing from the Lifecycle section; add the storage test that graph deletion never removes run/run_graph_snapshot records.

**Exit gate:** After a draft changes, a historical run still opens with an agreeing graph snapshot, release ID, fingerprint, traces, and selected edges.

## Test strategy

| Layer | Required coverage |
| --- | --- |
| Models / SDK | Legacy and v2 parse, fingerprint stability, backward-compatible response parsing. |
| Validation | Every blocking contract code, default-port normalization, schema uncertainty, transforms, capability outcomes. |
| Storage | Publish/list/get immutable releases, legacy fallback, release/run identity across every backend. Deleting a graph does not delete its runs or `run_graph_snapshots`; a run started from a since-deleted graph still opens read-only. |
| Runtime | Contract wrappers allow valid data, reject invalid input/output safely, preserve route/event ordering. |
| API | Publish rejects blockers; release run uses snapshot; draft run creates distinct identity. |
| Studio | Contract diagnostics, publish gate, historical snapshot inspection, existing author/run controls. |
| End-to-end | Create graph, type edge, publish, mutate draft, run release, inspect original release path. |

Run backend `uv run pytest -q`, SDK/frontend tests, and `npm run build` per slice. Browser verification is mandatory for Slices B and D because the core promise is visual diagnosis, not only API correctness.

## Risks and acceptance criteria

| Risk | Mitigation |
| --- | --- |
| Pydantic/Zod drift | Add backend-produced cross-wire fixtures; do not block P0 on code generation. |
| Ambiguous legacy values | Normalize to documented defaults and warn where safety cannot be proven; never add hidden transforms. |
| Object-store release growth | Prefer correct immutable payloads; defer deduplication until measured. |
| Runtime extraction changes routes | Establish golden existing-run tests before adapter refactor; preserve event names and selected-edge semantics. |
| Version UX overwhelms authoring | Keep release state in toolbar/inspector, not a separate management surface. |
| P0 expands into P1 | Exclude fixture runner, semantic diffs, replay variants, review queues, and second runtime target. |
| Resource snapshot staleness/size | Embed only the three currently live-resolved kinds (`tools`, `mcp_servers`, per-graph `knowledge`); rely on the existing object-store release-growth mitigation above; do not build resource versioning in P0. |
| Ambiguous multi-edge input binding at runtime | Contract pass blocks non-sibling multiple bindings to one input port (`NODE_INPUT_PORT_AMBIGUOUS_BINDING`); runtime falls back to declared edge order and emits `CONTRACT_RUNTIME_AMBIGUOUS_INPUT` if it ever occurs despite validation. |

P0 is done only when:

- Releases are immutable, retrievable, fingerprinted, and independent of later draft edits.
- Every edge resolves explicit/default ports with a readable compatibility result.
- Structural, contract, and LangGraph blockers prevent release execution.
- Existing POC graphs remain readable/runnable as draft snapshots.
- Runs persist release or draft-snapshot identity, compiler version, and target.
- Studio identifies boundary problems at the graph and opens historical runs against original snapshots.
- LangGraph is an adapter with an explicit capability matrix, not the canonical graph model.
- Automated backend/SDK coverage and primary Studio browser flow pass.
- Release payloads are literally self-contained: every `tool`/MCP/knowledge binding a released graph's nodes resolve at runtime is embedded in the release, not re-fetched live.
- A run started from a draft is durably inspectable after the draft changes or the graph is deleted, identically to a release-sourced run.

## Follow-on boundary

P1 can add semantic release comparison, fixture simulation, subgraph stubbing, replay, reusable assets, and routing experiments. P2 can add policies, knowledge lineage, reviews, and selected additional runtime adapters. Simulation and replay must consume P0 immutable snapshots and the same contract/capability diagnostics; otherwise the product creates competing sources of truth.
