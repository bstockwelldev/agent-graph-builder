---
title: Graph-native control plane - strategic product plan
status: locked
capability: graph-native-control-plane
linear_issue: none
locked_at: 2026-09-19
last_updated: 2026-09-19
---

# Graph-native control plane - strategic product plan

> **Status:** Locked planning direction.
> **Scope:** Product positioning, durable architecture direction, and roadmap priorities.
> **Instruction boundary:** This document records product strategy supplied by the user. It is not an implementation request by itself.

## 1. Positioning

Agent Graph Builder should not compete as another generic node editor or agent runtime. LangGraph can execute graphs, LangSmith can trace and evaluate runs, n8n can integrate applications, and Dify/Langflow/Flowise can assemble AI workflows. The product opportunity is to make the graph itself the durable, inspectable, governed engineering artifact.

**Primary USP:**

> Agent Graph is a graph-native engineering workspace for production multi-agent systems. It lets teams define typed, versioned agent workflows; validate data and policy boundaries; simulate and replay complex runs; compare routing, models, tools, and retrieval strategies; and deploy the same governed graph through supported execution runtimes such as LangGraph.

**Recommended product direction:**

Start as a **Multi-Agent Reliability Studio** and architect toward a broader **Visual Agent Systems IDE**.

The first paid-value wedge is reliability: make multi-agent systems testable, replayable, explainable, and safe before production. The longer-term destination is the engineering workspace for designing, governing, testing, and operating production multi-agent systems.

## 2. Competitive baseline

Treat these as integration points or table stakes, not the center of the differentiation:

| Tool / category | Commodity strength to respect | Open space for this product |
| --- | --- | --- |
| LangGraph | Stateful graph orchestration, durable execution, streaming, checkpoints, memory, human pauses | Visual graph engineering, semantic modeling, review, portability, portfolio governance |
| LangSmith | Tracing, telemetry, datasets, evals, experiments, annotation, dashboards, managed LangGraph operations | Canonical graph authoring and graph change-management |
| n8n | Broad integrations, workflow automation, tools, memory, multi-model workflows, natural-language workflow assistance | Typed agent-system architecture, routing policy governance, graph-level experiment control |
| Dify | Visual AI workflows, RAG, prompt management, tools, monitoring integration, human input, collaboration | Graph as central systems-modeling layer |
| Langflow / Flowise | Fast low-code LLM/RAG/agent prototyping | Production graph SDLC, governance, semantic diffs, replay |
| Microsoft Agent Framework | Graph/functional workflows, orchestration patterns, checkpoints, observability, visualization | Neutral visual control plane across runtimes and providers |

## 3. Table stakes

Do not lead the product message with any one of these alone:

- Drag-and-drop workflow canvas.
- LLM/model selection.
- Prompt and tool configuration.
- Basic routers and conditional branches.
- RAG/retrieval nodes.
- MCP/tool integration.
- Human approval nodes.
- Trace trees, logs, token usage, latency, and cost.
- Dataset-based evaluation.
- Basic deployment/version labels.
- Natural-language workflow generation.

Natural-language graph building should become a productivity feature after the graph model, validation, versioning, and simulation layers are robust.

## 4. Strategic pillars

### Canonical Graph IR and Runtime Portability

The core product artifact is a canonical typed workflow graph independent of any single runtime.

```text
Visual graph editor
        ↓
Canonical typed workflow graph
        ↓
Validation + version + policy + test suite
        ↓
Compiler target
├── LangGraph
├── Microsoft Agent Framework
├── Azure AI Foundry deployment
├── Local Python/TypeScript executor
└── Future runtime adapters
```

The portability promise must be explicit and bounded:

```text
Core portable graph semantics
+ Runtime adapter
+ Explicit capability matrix
+ Target-specific extension nodes
+ Compile-time compatibility report
```

Do not claim universal runtime parity. Different runtimes have different state models, event models, loop semantics, memory behavior, and tool contracts.

### Graph-Native SDLC and Semantic Diffs

Every workflow should become a versioned software asset with immutable releases, drafts, review, approvals, environment bindings, policy gates, reproducible run snapshots, and rollback tied to exact graph/entity versions.

Semantic diffs should explain behavior changes, not raw JSON changes. Example categories:

- Node config deltas: model, prompt, token cap, timeout, tool binding, retriever profile.
- Edge/router deltas: thresholds, fallback route, route weights, escalation paths.
- Predicted impact: cost, latency, route distribution, affected fixtures, required evaluations, policy gates.

### Typed Contracts Across Nodes and Edges

Every connection should model:

```text
Source output contract
        ↓
Optional transform / coercion
        ↓
Target input contract
        ↓
Validation result
```

Support JSON Schema, Zod, Pydantic, and generated contracts where useful. Port types should include `message`, `structured-json`, `documents`, `decision`, `artifact`, `tool-result`, `approval`, and `error`.

The product should enforce compile-time compatibility, runtime schema validation, visual incompatibility feedback, transform suggestions, edge contract tests, data-classification labels, and lineage views.

### Simulation Before Execution

Add a Plan/Simulate mode that avoids live tools and expensive models by default:

```text
Input fixture
   ↓
Static graph validation
   ↓
Mock / recorded node output
   ↓
Router decision simulation
   ↓
Contract propagation
   ↓
Estimated cost / latency / risk
   ↓
Expected execution-path visualization
```

The message: understand what the agent system is expected to do before paying to discover what it did.

### Routing Policy Workbench

Routers should be first-class, testable policy objects rather than opaque code functions or generic conditional edges.

Expose deterministic rules, classifier strategies, LLM strategies, thresholds, weights, priority ordering, budget-aware and latency-aware choices, data-sensitivity constraints, skill/tool constraints, fallback/escalation paths, and per-route evaluation criteria.

Build a Routing Lab that compares routing versions over fixture datasets by distribution, quality, cost, latency, tool failure rate, and policy violations.

### Cross-Cutting Policy Overlays

Policy should be expressible across nodes, edges, environments, and roles rather than embedded only inside individual node configs.

Policy overlays should cover security/privacy, reliability, cost/performance, and governance. The graph should show coverage, violations, blocked deployment reasons, exception approvals, expiry, and audit trail.

### Reproducible Replay and Counterfactual Debugging

Historical runs should become engineering datasets. Counterfactual replay should support:

- Same graph with a new model.
- Same graph with an alternative router policy.
- Same graph with a new retriever or chunking profile.
- Same graph with captured tool responses.
- New graph version with original inputs.
- One changed node with all other node outputs frozen.

Compare output quality, route selection, cost, latency, tool calls, retrieval evidence, evaluation scores, policy outcomes, and downstream behavioral divergence.

### Knowledge-to-Agent Lineage

Treat retrieval and document processing as a typed graph subsystem:

```text
Source file
  ↓
OCR / document conversion
  ↓
Structure extraction
  ↓
Classification
  ↓
Chunking
  ↓
Embedding
  ↓
Indexing
  ↓
Retrieval
  ↓
Reranking
  ↓
Grounded agent response
  ↓
Citation, evidence, and evaluation
```

Version and compare extraction model, chunking rules, embedding model, metadata filters, retriever/reranker config, source lineage, evidence packs, retrieval metrics, citation coverage, and groundedness.

### Large-Graph Complexity Management

The editor must stay usable when workflows exceed a handful of nodes.

Support semantic subgraphs with typed interfaces, reusable versioned entities, collapse/expand, architecture layers, focus modes, search/dependency graph, blast-radius analysis, multiple graph views, and a graph health score.

## 5. Recommended Product Loop

```text
Import/create graph
      ↓
Add typed contracts and reusable entities
      ↓
Validate graph and policies
      ↓
Simulate with fixtures or recorded traces
      ↓
Run against LangGraph
      ↓
Replay a production run
      ↓
Modify one node, route, model, retriever, or prompt
      ↓
Compare output, cost, latency, routing, evidence, and evaluation
      ↓
Approve and publish immutable graph version
```

This loop creates value even for teams that keep LangGraph, LangSmith, n8n, Azure AI Foundry, or existing observability tools.

## 6. Feature Priority

| Priority | Capability | USP contribution | Build now? |
| --- | --- | --- | --- |
| P0 | Canonical typed graph schema and versioning | Foundation | Yes |
| P0 | Graph-aware validation: structure, ports, schemas, policies | Reliability and usability | Yes |
| P0 | Visual workflow IDE with semantic nodes/edges | Core authoring | Yes |
| P0 | LangGraph compiler/runtime adapter | Immediate execution value | Yes |
| P0 | Run timeline linked to nodes/edges | Core debugging loop | Yes |
| P1 | Graph semantic diffs and review workflow | Differentiator | After P0 |
| P1 | Fixture-based simulation and deterministic node stubbing | Differentiator | Yes |
| P1 | Replay of historical runs | Differentiator | Yes |
| P1 | Versioned reusable entity registry | Scale and governance | Yes |
| P1 | Routing policy lab and scenario comparison | Differentiator | Yes |
| P2 | Cross-cutting policy overlays | Enterprise differentiation | Later |
| P2 | Retrieval/document lineage graph | Knowledge-work wedge | Later |
| P2 | Multi-runtime compiler targets | Strategic moat | Start with one; expand selectively |
| P2 | Collaboration, comments, approvals, review queues | Enterprise readiness | Later |
| P3 | Natural-language graph builder | Convenience, weak moat | Later |
| P3 | Large integration catalog | Commodity | Integrate through MCP and existing platforms |

## 7. Non-Goals and Traps

Avoid building these first:

- Broad Zapier/n8n-style integration marketplace.
- Generic chat-agent builder.
- Agent-framework abstraction layer that claims runtime parity everywhere.
- Standalone observability platform replacing LangSmith, Datadog, or OpenTelemetry.
- Fully autonomous graph-generation assistant before contracts, validation, versioning, and simulation mature.
- Visual code replacement pitch; expert users still need code escape hatches, typed SDKs, and testable runtime artifacts.

## 8. Current-Doc Contradictions to Resolve

| Current repo signal | Contradiction / tension | Resolution |
| --- | --- | --- |
| README still frames the product as a POC proving six node types in `apps/playground`. | The repo has already added `apps/studio`, more node types, telemetry, RAG, auth, analytics, and a larger strategic ambition. | Phase 6 docs must rewrite README around Studio and the graph-native control-plane direction. |
| Roadmap emphasizes already-shipped shell/canvas polish and consolidation history. | It does not yet prioritize graph SDLC, contracts, simulation, replay, routing lab, policy overlays, or portability. | Add a strategic roadmap section with P0/P1/P2 control-plane capabilities. |
| Existing plans treat LangGraph execution as the runtime center. | The strategic direction treats LangGraph as the first supported executor, not the whole product boundary. | Preserve LangGraph as the first adapter while documenting canonical graph IR and capability reports. |
| Existing validation is mostly structural/configuration validation. | The new direction requires typed edge contracts, policy gates, and simulation-oriented validation. | Expand validation into contract and policy validation before building advanced runtime adapters. |
