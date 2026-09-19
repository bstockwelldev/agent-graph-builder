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
| `router`, `branch` | `message` | `decision` |
| `guardrail`, `rubric` | `message` | `message`, `error` |
| `human_gate` | `approval` | `approval` |
| `tool_loop` | `message` | `message`, `tool-result` |
| `code_exec` | `structured-json` | `artifact`, `error` |
| `output` | `message` | none |

Current executors that accept loose dictionaries or strings are normalized behind this boundary; P0 does not rewrite executor internals solely to change native value shapes.

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

P0 permits running a valid draft as a convenience, but the server creates an ephemeral immutable run snapshot first. The run labels this `source: "draft_snapshot"`; it is not a published release. Environment promotion is not P0 scope.

### Fingerprint

The release fingerprint is SHA-256 over canonical JSON for the normalized graph. It includes configs, normalized ports, edges, transforms, and portable extensions, while excluding display-only timestamps, graph name, canvas position, release notes, and author metadata. Moving a node must not invalidate runtime reproducibility.

### Persistence and API

Use the existing `backend/app/storage.py` abstraction with equivalent logical structures across every backend:

```text
graphs/{graph_id}.json                 # existing mutable draft, migrated in place
graph_releases/{graph_id}/{release}.json
graph_release_index/{graph_id}.json    # release IDs, fingerprints, timestamps
run_snapshots/{run_id}.json             # graph identity captured at run start
```

SQLite/Turso should use release-index and release-payload tables, rather than an unbounded release array in `graphs`. Blob/object-store uses corresponding immutable keys. Missing release indexes must be tolerated for legacy graphs.

| Endpoint / SDK method | Purpose |
| --- | --- |
| `GET`/`PUT /api/graphs/{id}/draft` | Read/save editable graph; current graph routes stay aliases during migration. |
| `POST /api/graphs/{id}/validate` | Validate a draft or supplied release target. |
| `POST /api/graphs/{id}/releases` | Publish an immutable release after validation. |
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

Initial stable blocking codes: `EDGE_SOURCE_PORT_NOT_FOUND`, `EDGE_TARGET_PORT_NOT_FOUND`, `EDGE_PORT_DIRECTION_INVALID`, `EDGE_CONTRACT_KIND_INCOMPATIBLE`, `EDGE_SCHEMA_INCOMPATIBLE`, `EDGE_TRANSFORM_INVALID`, `NODE_REQUIRED_INPUT_UNBOUND`, and `LANGGRAPH_CAPABILITY_UNSUPPORTED`.

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
  graph_fingerprint: string;
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

**Exit gate:** Existing demo graphs load, validate structurally, compile, and run as draft snapshots unchanged.

### Slice B: Contract validation and canvas feedback

- Split validation passes and introduce extended diagnostics.
- Validate ports, direction, kind, basic JSON Schema, required inputs, and transforms.
- Surface node/edge diagnostics in Studio while preserving Playground compatibility.

**Exit gate:** Incompatible edges block publish/run, explain themselves at the edge, and have backend, SDK, and Studio coverage.

### Slice C: Immutable releases and capability reports

- Add draft/release API and SDK methods.
- Publish immutable snapshots after clean LangGraph capability validation.
- Extract `LangGraphAdapter` from compiler/runtime logic.

**Exit gate:** Editing a draft cannot change a published release or a run started from it.

### Slice D: Version-pinned execution timeline

- Capture run identity at creation and safe contract lifecycle events.
- Update historical inspection to open release snapshots read-only.
- Add API migration notes.

**Exit gate:** After a draft changes, a historical run still opens with an agreeing graph snapshot, release ID, fingerprint, traces, and selected edges.

## Test strategy

| Layer | Required coverage |
| --- | --- |
| Models / SDK | Legacy and v2 parse, fingerprint stability, backward-compatible response parsing. |
| Validation | Every blocking contract code, default-port normalization, schema uncertainty, transforms, capability outcomes. |
| Storage | Publish/list/get immutable releases, legacy fallback, release/run identity across every backend. |
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

P0 is done only when:

- Releases are immutable, retrievable, fingerprinted, and independent of later draft edits.
- Every edge resolves explicit/default ports with a readable compatibility result.
- Structural, contract, and LangGraph blockers prevent release execution.
- Existing POC graphs remain readable/runnable as draft snapshots.
- Runs persist release or draft-snapshot identity, compiler version, and target.
- Studio identifies boundary problems at the graph and opens historical runs against original snapshots.
- LangGraph is an adapter with an explicit capability matrix, not the canonical graph model.
- Automated backend/SDK coverage and primary Studio browser flow pass.

## Follow-on boundary

P1 can add semantic release comparison, fixture simulation, subgraph stubbing, replay, reusable assets, and routing experiments. P2 can add policies, knowledge lineage, reviews, and selected additional runtime adapters. Simulation and replay must consume P0 immutable snapshots and the same contract/capability diagnostics; otherwise the product creates competing sources of truth.
