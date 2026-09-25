---
title: Agent-Graph Query Language (AIQL) — exploration
status: exploration (not locked; needs research + heavy design review before any build)
date: 2026-09-25
linear_issue: STO-625
---

# AIQL — a query language over agent graphs, runs, and their lineage

> **Status:** idea capture only. Nothing here is committed scope. The next step is research plus a design review that has to show the value is real before any implementation plan is written.

## 1. Idea

Agent graphs in this repo are already property graphs: typed nodes with config, typed edges, ports with contracts, releases, and runs with node traces and route decisions. Today every question about them ("which graphs call tool X?", "which paths reach a tool with no guardrail?", "which runs took the fallback branch and then failed?") is a hand-written Python or TypeScript scan.

AIQL would be a declarative query language, in the spirit of Cypher (Neo4j), Gremlin/openCypher (Amazon Neptune) and ISO GQL, for searching the **design-time graph**, the **runtime history**, and the **links between them** in one query.

```text
-- illustrative only; syntax undecided
MATCH (i:input)-[*]->(t:tool {toolName: "web_search"})
WHERE NOT EXISTS (i)-[*]->(:guardrail)-[*]->(t)
RETURN graph.name, t.id
```

```text
MATCH (r:run {status: "failed"})-[:DECIDED {edgeKind: "default"}]->(n:router)
WHERE r.started_at > now() - 7d
RETURN n.graph_id, count(r)
```

## 2. Value hypotheses (each must be proven or dropped)

| # | Hypothesis | Who benefits | How we'd prove it |
| - | ---------- | ------------ | ----------------- |
| H1 | Policy and safety checks ("no tool reachable without a guardrail") are easier to write, review and keep as queries than as code. | Authors, reviewers, policy overlays | Re-express 5 existing checks from `contracts.py`/`policies.py`/`graphHealth` as queries; compare size and readability. |
| H2 | Cross-graph impact analysis ("what breaks if I change prompt P or tool T?") is a common need. | Maintainers of many graphs | Count real questions over a month; check how well `usedBy` and resource bindings answer them today. |
| H3 | Querying run history by path ("runs that went router→fallback→tool and failed") speeds up debugging. | Operators | Time debugging tasks with and without it on recorded runs. |
| H4 | The same queries can drive UI: saved searches, canvas highlighting, and lint rules. | Studio users | Prototype a "find on canvas by pattern" on top of `FindBar`. |

If H1–H3 fail, AIQL is not worth building. Better filters on existing screens would cover the need.

## 3. Options to research

- **A. Embed an openCypher/GQL subset** and evaluate it in-process against an in-memory property graph built from `GraphDefinition`s plus run snapshots. No new infrastructure, bounded by memory.
- **B. Project into a graph database** (Neo4j, or Neptune with openCypher/Gremlin) and query there. Strong for history at scale, but it adds infrastructure, sync and cost. The storage direction is Supabase, so also evaluate **Apache AGE on Postgres** (Cypher inside Postgres).
- **C. A small purpose-built DSL** compiled to Python predicates over the existing models. Simplest, but the least standard and the easiest to outgrow.
- **D. Natural language → query**, with an LLM generating A/B/C queries. This is an interaction layer over the others, not a substitute for them.

## 4. Open design questions

- Data model: which entities are first-class (graph, node, edge, port, release, run, trace, route decision, resource) and how versions and releases appear (time-travel queries?).
- Scope: design-time only first, or design-time plus runs from day one?
- Security and tenancy: queries must respect the future org/project boundaries (EDD: Supabase RLS).
- Cost limits: bounded path expansion, timeouts, and no unbounded `*` over run history.
- Surface: API endpoint, SDK method, studio query panel, saved queries as policy rules.
- Standards: stay a strict subset of ISO GQL / openCypher, or accept extensions for ports and contracts?

## 5. Design review gates

1. **Research memo:** prior art (Cypher, GQL, Gremlin, SPARQL, AGE, Neptune openCypher), with a recommendation among A–D.
2. **Value proof:** the H1–H3 evidence above, with a go/no-go.
3. **Design review:** data model, grammar subset, security model, performance budget.
4. Only then: an 11-section feature-change plan (`feature-change-plan` template) and a phased build.

## 6. Non-goals (for now)

- Replacing Supabase storage with a graph database.
- A general-purpose query language beyond agent graphs, runs and lineage.
- Write queries (mutations stay in the typed graph edit API).

## 7. Related

- `docs/planning/features/graph-native-control-plane-plan.md`: canonical typed graph IR, lineage, and policy overlays that AIQL would query.
- `backend/app/policies.py`, `backend/app/contracts.py`, `apps/studio/lib/graphHealth.ts`: checks that H1 would re-express.
- `packages/agent-graph-sdk/src/graph/*`: existing client-side graph traversal helpers (`upstream`, `computeFocusNodeIds`).
