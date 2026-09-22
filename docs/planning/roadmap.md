---
title: Agent Graph Builder POC — product roadmap
last_updated: 2026-09-22
---

# Product roadmap

Prioritized backlog for the Agent Graph Builder POC **after** the next-set trilogy and shell layout polish. Ordering uses **priority** (when to do it), **impact** (user-visible payoff), and **utility** (why it earns a slot).

**Strategic update (2026-09-19):** The product direction is now a graph-native engineering control plane, starting with a Multi-Agent Reliability Studio wedge and moving toward a Visual Agent Systems IDE. The roadmap below preserves shipped history, but new planning should prioritize the canonical typed graph, graph-aware SDLC, contracts, simulation, replay, routing policy, and policy-overlay work documented in [strategic-design.md](strategic-design.md), [graph-native-control-plane-plan.md](features/graph-native-control-plane-plan.md), and [studio-ux-revision-plan.md](features/studio-ux-revision-plan.md).

**Legend**

| Priority | Meaning |
| -------- | ------- |
| **P0** | Ship gate — block merge or release until done |
| **P1** | High payoff next slice — demo quality or core UX |
| **P2** | Operator / platform ergonomics |
| **P3** | Quality depth — tests, docs, nice-to-haves |

| Impact | Meaning |
| ------ | ------- |
| **High** | Changes first-impression usability or graph comprehension |
| **Medium** | Meaningful polish or power-user win |
| **Low** | Incremental; defer if schedule tight |

---

## Completed / in flight

| Item | Status | Spec / branch |
| ---- | ------ | --------------- |
| App shell resilience | Shipped | [app-shell-resilience-plan.md](features/app-shell-resilience-plan.md) |
| Canvas orientation (dagre, Auto/H/V) | Shipped | [canvas-orientation-plan.md](features/canvas-orientation-plan.md) |
| From-scratch authoring | Shipped | [from-scratch-authoring-plan.md](features/from-scratch-authoring-plan.md) |
| Shell layout polish + wide-viewport flex fix | Shipped | [shell-layout-polish-plan.md](features/shell-layout-polish-plan.md) |
| Repo dev scripts + global `dev` CLI docs | Shipped | `scripts/`, `README.md` |
| Canvas visual language (node color/shape, blueprint background) | Shipped | `feat/p1-canvas-and-shell-ux` — `theme.ts` `nodeType`/`canvas`, `GraphNodeView.tsx`, `FlowCanvas.tsx` |
| Empty states, loading shimmers, collapsible panels | Shipped | `feat/p1-canvas-and-shell-ux` — `ui/Skeleton.tsx`, `ui/CollapsibleSection.tsx`, `RunPanel.tsx`, `GraphLibrary.tsx` |
| Vercel full-stack deploy | Shipped | `master` — https://agent-graph-builder-app.vercel.app |
| Git remote + CI | Shipped | `origin` → [bstockwelldev/agent-graph-builder](https://github.com/bstockwelldev/agent-graph-builder); `.github/workflows/ci.yml` on push/PR to `master` |
| Ultra-wide layout tokens | Shipped | `feat/p2-ultra-wide-layout-tokens` — `shell.breakpoint.wide` (1280), `shell.canvasMinWidth`, inspector drawer below wide |
| Playground shell panels (Execute vs Observe) | Shipped | [playground-shell-panels-plan.md](features/playground-shell-panels-plan.md) — `c6b5467` on `master`; prod https://agent-graph-builder-app.vercel.app |
| Frontend tests (Vitest + RTL) | Shipped | `canvasFit.test.ts`, `Tooltip.test.tsx`, `shellLayout.test.ts`, `FlowCanvas.test.tsx` (mocked `fitView`) |
| Studio shell UX remediation (Phase 10, Slices A-D) | Shipped | [studio-shell-ux-gap-analysis.md](features/studio-shell-ux-gap-analysis.md) |
| Knowledge-base panel + saved/run-captured Routing Lab datasets | Shipped | Graph-scoped `knowledge` panel; `datasets` stored resource with a Routing Lab picker; `POST /api/datasets/from-runs` + run-history "Save selected as dataset". See the gap analysis's Tier 2 rows. |

---

## Prioritized backlog

| Pri | Item | Impact | Utility | Notes / touch points |
| --- | ---- | ------ | ------- | -------------------- |
| **P0** | ~~**QA + merge shell layout branch**~~ | High | Done 2026-09-09 | Merged `feat/shell-layout-polish` → `master`; run `npm run build` + `uv run pytest` before deploy. |
| ~~**P0**~~ | ~~**Configure git remote + CI on push**~~ | Medium | Done 2026-09-10 | `origin` → GitHub; CI runs `uv run pytest` + `npm ci && npm run build` via `.github/workflows/ci.yml`. |
| ~~**P1**~~ | ~~**Canvas visual language — node color, shape, blueprint background**~~ | High | High | **Shipped 2026-09-09** on `feat/p1-canvas-and-shell-ux`. Semantic `nodeType` tokens, per-type shapes, dual-line blueprint `Background`. |
| ~~**P1**~~ | ~~**Empty states, loading shimmers, collapsible panels**~~ | High | High | **Shipped 2026-09-09** on `feat/p1-canvas-and-shell-ux`. `Skeleton`, `CollapsibleSection`, empty states + `localStorage` panel persistence. |
| **P2** | **Dev CLI Phase 2** (factory) | Medium | High for polyrepo daily use | `dev doctor`, `dev gate`, shell completion, register tabletop / ai-lab stacks. Canonical home: `agent-context-factory/packages/local-dev-cli`. |
| ~~**P2**~~ | ~~**Ultra-wide layout tokens**~~ | Medium | Medium | **Shipped 2026-09-09** on `feat/p2-ultra-wide-layout-tokens`. `shell.canvasMinWidth` (420), `shell.breakpoint.wide` (1280); inspector rail only at wide+, drawer below. |
| ~~**P3**~~ | ~~**Frontend tests (Vitest + RTL)**~~ | Medium | Medium | **Shipped 2026-09-12** — `canFitView` unit tests, TaxonomyTooltip layout RTL, existing `shellLayout` flex cases, mocked `fitView` call gating. |
| ~~**P3**~~ | ~~**Repo `AGENTS.md`**~~ | Low | Medium | **Shipped 2026-09-10** — repo-root `AGENTS.md` router for agents. |
| **P3** | **Canvas orientation Phase E** | Low | Low | elk fallback, dual layout positions — [canvas-orientation-plan.md](features/canvas-orientation-plan.md) follow-ons. |
| **P3** | **Scored eval store** | Medium | Depends on a live-run decision | Not scoped. Extends the saved Routing Lab datasets with expected outputs, scorers (the existing `rubric` node/`rubric.py` are candidates), and scored runs. Needs a design note first: `simulate_graph` forces the stub provider, so scoring output *quality* means a live-provider execution path — who pays, which keys, and how to handle non-deterministic output. |
| **P3** | **Mobile bottom nav tray** | Low | Medium for mobile users | Future prospect, not scoped yet: a standard mobile-app-style bottom tab bar (3-4 primary destinations) for compact widths, replacing/upgrading the graph canvas route's existing ad hoc compact action bar (`GraphEditor.tsx`'s `workbench.isCompact` icon row) with something closer to native mobile navigation conventions and consistent across more than just the canvas route. |
| ~~**P2**~~ | ~~**Durable store (object store / Turso)**~~ | Medium | High | **Shipped 2026-09-10** — Vercel Blob (`BLOB_READ_WRITE_TOKEN`) preferred on Vercel; `OBJECT_STORE_*` S3-compatible JSON remains the self-host path; Turso libsql optional. |
| ~~**P0**~~ | ~~**Studio consolidation Phase 1 — schema**~~ | High | High | **Shipped 2026-09-15.** Absorbed micro-ui-agent-builder's 11-node vocabulary into `NodeType` with typed configs; per-type compiler diagnostics. See [studio-consolidation-plan.md](features/studio-consolidation-plan.md). |
| ~~**P1**~~ | ~~**Studio consolidation Phase 2 — executors**~~ | High | High | **Shipped 2026-09-15.** `guardrail`/`rubric`/`branch`/`tool_loop`/`code_exec`/`human_gate` node executors (pause/resume in-memory only); `FlowDocument → GraphDefinition` migration script. |
| ~~**P1**~~ | ~~**Studio consolidation Phase 3 — registries**~~ | High | High | **Shipped 2026-09-15.** Stored prompts/tools/mcp_servers/agents/llm_profiles + generic CRUD; builtin `web_search`/`calculator` + MCP JSON-RPC client; `DELETE /api/graphs/{id}`. `lookup_topic` kept (not retired) for backward compat; flow-scoped allowlist and MCP schema validation deferred. |
| ~~**P1**~~ | ~~**Studio consolidation Phase 4 — studio app**~~ | High | High | **Shipped 2026-09-16.** `apps/studio` (Next.js) fully ported alongside `apps/playground` across sub-phases 4a–4f: pnpm migration, design system, shell/CRUD, graph editor with all 12 node types, run surface + GenUI, and SDK Zod hardening (every `jsonFetch` response now schema-validated). Playground parity confirmed via live Playwright pass — identical run event logs/traces for the same graph in both apps. `apps/playground` stays deployed until Phase 6 cutover. |
| ~~**P2**~~ | ~~**Studio consolidation Phase 5 — hardening**~~ | Medium | High | **Shipped 2026-09-16.** Telemetry (Langfuse, opt-in, fails open), per-graph RAG knowledge base, Supabase durable storage backend + studio OAuth, run analytics/spend estimation with a real dashboard — all ported from micro-ui-agent-builder with 57 new backend tests (226 total) and live end-to-end verification per area. |
| ~~**P2**~~ | ~~**Studio consolidation Phase 6 — cutover**~~ | High | High | **Functionally done.** `apps/playground` no longer exists on disk, and `vercel.json`/root `package.json` have zero references to it — confirmed by inspection 2026-09-22. Only the docs haven't caught up: `README.md` and root `AGENTS.md` still describe a playground POC. That's a documentation task, already tracked in the "Documentation Contradictions to Resolve" table below — keeping this as a separate live P2 build row double-counted the same gap. |
| ~~**P0**~~ | ~~**P0 graph foundation (Slices A-D) + Studio releases UI**~~ | High | Foundation | **Shipped 2026-09-20.** Canonical typed ports + contract validation (`ports.py`, `contracts.py`), immutable `GraphRelease`s with LangGraph capability reports (`releases.py`, `adapters.py`), version-pinned `RunGraphSnapshot` run identity, and the Studio `ReleasesPanel`/run-history UI. See [p0-graph-foundation-design-plan.md](features/p0-graph-foundation-design-plan.md). |

---

## Strategic Roadmap Addendum

This addendum is the forward roadmap for the product after consolidation. It intentionally avoids leading with generic workflow-builder features and treats LangGraph, LangSmith, n8n, Dify/Langflow/Flowise, and Microsoft Agent Framework capabilities as baselines or integration points.

**P0 implementation design:** [p0-graph-foundation-design-plan.md](features/p0-graph-foundation-design-plan.md) defines the four delivery slices for this foundation: canonical-model compatibility, contract validation and canvas feedback, immutable releases with LangGraph capability reports, and version-pinned run timelines. Use it as the build baseline for the P0 items below.

| Pri | Capability | Impact | Utility | Notes / touch points |
| --- | --- | --- | --- | --- |
| **P0** | **Canonical typed graph schema and immutable versioning** | High | Foundation | Make `GraphDefinition` the governed graph IR with versioned graph/entity releases, draft/candidate/published lifecycle, and release snapshots. Builds on `backend/app/models.py`, SDK Zod schemas, storage resources. |
| **P0** | **Graph-aware validation for structure, ports, schemas, and policy** | High | Reliability | Extend today’s compile validation into typed port contracts, edge compatibility, required transforms, data labels, policy checks, and compatibility reports. |
| ~~**P0**~~ | ~~**Studio UX revision: selection-driven workflow IDE**~~ | High | Core UX | **Superseded by Phase 10 (Shipped).** Rail/drawer switcher, rebuilt toolbar, selection dock (Configure/I-O/Policy/Run tabs), canvas node launcher, typed-port/compatible-target feedback, and scoped run/debug actions all shipped — see [studio-shell-ux-gap-analysis.md](features/studio-shell-ux-gap-analysis.md)'s Tier 1/2 tables. The only piece of `studio-ux-revision-plan.md`'s scope still open is large-graph complexity management, which is tracked on its own as the P3 row below (not a P0 gate). |
| **P0** | **LangGraph adapter as first compiler/runtime target** | High | Execution | Keep LangGraph as the first supported executor while documenting capability limits and target-specific extensions. |
| **P0** | **Run timeline linked to nodes and edges** | High | Debug loop | Normalize run events into timeline, canvas state, trace drilldown, route decision visibility, pause/resume, retries, and errors. |
| **P1** | **Diagnostics as a navigation system** | High | Debug loop | Confirmed gap (2026-09-22 UX review pass against `apps/studio`): clicking a compile/validation warning does nothing beyond showing inline text today — `FlowCanvas.tsx` has no pan/zoom/select path from a diagnostic to its node/edge/port. Full design spec + acceptance criteria: [studio-ux-gap-remediation-plan.md §1](features/studio-ux-gap-remediation-plan.md#1-diagnostics-as-a-navigation-system). Linear: [STO-592](https://linear.app/stockwise-productions-prototypes/issue/STO-592). |
| **P1** | **App-wide console/log drawer** | High | Debug loop | Requested 2026-09-22. Completes a locked-but-unbuilt element of `strategic-design.md`'s Studio UX Principles ("bottom run console for timeline, logs, artifacts, metrics, and evaluations") — the current run surface is a right-side HUD panel, not a bottom console, and there is no app-wide surface for client-side errors/warnings at all today (they only reach the browser devtools console). Full design spec + acceptance criteria: [studio-config-editor-and-console-plan.md §7](features/studio-config-editor-and-console-plan.md#7-app-wide-consolelog-drawer). Linear: [STO-594](https://linear.app/stockwise-productions-prototypes/issue/STO-594). |
| **P1** | **Semantic graph diffs and review workflow** | High | Differentiator | Compare graph versions by behavior: node config changes, router thresholds, fallback paths, model swaps, cost/latency impact, affected fixtures, required evaluations. Slice A of [p1-rollout-plan.md](features/p1-rollout-plan.md). |
| **P1** | **Fixture-based simulation and deterministic stubbing** | High | Differentiator | Plan/Simulate mode with recorded outputs, router decision simulation, contract propagation, unreachable/fallback path checks, and estimated cost/latency/risk. Slice B of [p1-rollout-plan.md](features/p1-rollout-plan.md). |
| **P1** | **Historical replay and counterfactual debugging** | High | Differentiator | Replay captured runs with frozen tool outputs, alternate model/router/retriever/node versions, and output/cost/latency/eval/policy comparison. Slice C of [p1-rollout-plan.md](features/p1-rollout-plan.md). |
| **P1** | **Historical run waterfall** | Medium | Debug loop | Confirmed gap: no timing/sequencing visualization exists anywhere in the repo — run history (`/runs/[graphId]` panel) is a sortable table only. Depends on the P0 run-timeline work landing first; pairs with Historical replay (Slice C). Full design spec + acceptance criteria: [studio-ux-gap-remediation-plan.md §2](features/studio-ux-gap-remediation-plan.md#2-historical-run-waterfall). Linear: [STO-593](https://linear.app/stockwise-productions-prototypes/issue/STO-593). |
| **P1** | **Raw JSON/YAML config editor (node/edge/graph)** | Medium | Escape hatch / power-user debug | Requested 2026-09-22. Confirmed gap: zero JSON/YAML editor libraries anywhere in `apps/studio`, and `NodeInspector`'s Configure tab is typed-form-only with no raw-text escape hatch. Directly fulfills the "Explicit Non-Goals" section's existing commitment to "preserve code escape hatches." Phase 1 (node/edge Raw tab) is independent of Phase 2 (graph-level export/import). Full design spec + acceptance criteria: [studio-config-editor-and-console-plan.md §6](features/studio-config-editor-and-console-plan.md#6-raw-jsonyaml-config-editor). Linear: [STO-595](https://linear.app/stockwise-productions-prototypes/issue/STO-595). |
| **P1** | **Versioned reusable entity registry** | Medium | Scale | Make agents, prompts, tools, MCP servers, LLM profiles, retrievers, policies, and routers reusable versioned assets with blast-radius analysis. Parallel track in [p1-rollout-plan.md](features/p1-rollout-plan.md). |
| **P1** | **Routing policy lab** | High | Differentiator | Treat routers as testable policy objects; compare route distribution, quality, cost, latency, tool failures, and policy violations across datasets. Slice D of [p1-rollout-plan.md](features/p1-rollout-plan.md). |
| **P2** | **Cross-cutting policy overlays** | High | Enterprise | Security/privacy, reliability, cost/performance, and governance overlays with compile/deploy gates and exception expiry. |
| **P2** | **Chat: bind the scratchpad to graph/selection/run context** | Medium | Core UX | Confirmed gap: `ChatPanel.tsx` is a direct provider/model scratchpad (`client.sendChatMessage`) that bypasses the graph engine entirely — no selected-node, selected-run, or diagnostic context is ever injected, and it only preselects a session ID from the command palette. Prerequisite for the two rows below. Full design spec + acceptance criteria: [studio-ux-gap-remediation-plan.md §3](features/studio-ux-gap-remediation-plan.md#3-chat-bind-the-scratchpad-to-graphselectionrun-context). Linear: [STO-596](https://linear.app/stockwise-productions-prototypes/issue/STO-596). |
| **P2** | **Remote/graph flow invocation from Chat** | Medium | Differentiator | Confirmed gap: Chat can never trigger graph execution today. Depends on the Chat context-binding row above and on releases (`p0-graph-foundation-design-plan.md`) for version/environment resolution. Full design spec + acceptance criteria: [studio-ux-gap-remediation-plan.md §4](features/studio-ux-gap-remediation-plan.md#4-remoteflow-invocation-from-chat). Linear sync attempted 2026-09-22 but rejected — workspace is at its free-plan issue cap. Full text held in the [pending-issues Linear doc](https://linear.app/stockwise-productions-prototypes/document/agb-backlog-pending-issues-blocked-on-linear-issue-cap-28ee27337bdc) (attached to STO-596) until it can become a real issue. |
| **P2** | **Collapsed reasoning/tool-use disclosure in Chat** | Low | Polish | Confirmed gap: there's currently no tool-call/reasoning trace to disclose because the scratchpad bypasses the graph engine. Depends on the two rows above. `components/ai-elements/*` (already in the tree, from Vercel's AI Elements) is the natural place to add this. Full design spec + acceptance criteria: [studio-ux-gap-remediation-plan.md §5](features/studio-ux-gap-remediation-plan.md#5-collapsed-reasoningtool-use-disclosure-in-chat). Linear sync attempted 2026-09-22 but rejected — workspace is at its free-plan issue cap. Full text held in the [pending-issues Linear doc](https://linear.app/stockwise-productions-prototypes/document/agb-backlog-pending-issues-blocked-on-linear-issue-cap-28ee27337bdc) (attached to STO-596) until it can become a real issue. |
| **P2** | **Retrieval/document lineage graph** | Medium | Knowledge-work wedge | Version OCR/extraction, chunking, embeddings, indexes, retrievers, rerankers, evidence packs, citations, groundedness. Candidate upgrade stack for revisiting: [knowledge-pipeline-tech-stack-notes.md](features/knowledge-pipeline-tech-stack-notes.md). |
| **P2** | **Multi-runtime compiler targets** | Medium | Strategic moat | Add targets selectively after portable subset and capability matrix exist. Do not promise universal runtime parity. |
| **P2** | **Collaboration, comments, approvals, review queues** | Medium | Enterprise readiness | Tie review to semantic diffs, policy gates, owners, and immutable releases. |
| **P3** | **Natural-language graph builder** | Medium | Convenience | Add after graph model, validation, versioning, and simulation are mature; treat as productivity, not USP. |
| **P3** | **Large integration catalog** | Medium | Commodity | Prefer MCP and partner/runtime integrations rather than owning a broad marketplace early. |
| **P3** | **Large-graph complexity management** | Medium | Strategic pillar, not yet scoped | Subgraphs with typed interfaces, collapse/expand, dependency search, blast-radius analysis, multiple graph views, graph health score — named in `graph-native-control-plane-plan.md` and confirmed as the one remaining open piece of `studio-ux-revision-plan.md`'s scope by [studio-shell-ux-gap-analysis.md](features/studio-shell-ux-gap-analysis.md)'s Tier 3. Needs its own design pass before it can move to P1/P2 — not a paragraph inside another slice. |

## Explicit Non-Goals for the Next Product Slice

- Do not build a Zapier/n8n-style integration marketplace first.
- Do not pitch as a generic chat-agent builder.
- Do not claim runtime parity across all agent frameworks.
- Do not build a standalone LangSmith/Datadog/OpenTelemetry replacement.
- Do not prioritize autonomous graph generation before contracts, validation, versioning, and simulation.
- Do not frame the product as a visual code replacement; preserve code escape hatches, typed SDKs, and testable runtime artifacts.

## External trackers

Linear (`Stockwise-productions-prototypes` team, no dedicated project for this repo) held exactly two issues referencing `agent-graph-builder`: [STO-586](https://linear.app/stockwise-productions-prototypes/issue/STO-586) and [STO-587](https://linear.app/stockwise-productions-prototypes/issue/STO-587), both from a 2026-09-12 UX critique against the now-deleted `apps/playground` POC (`agent-graph-builder-poc.vercel.app`). Reviewed 2026-09-22: every acceptance criterion in both issues checks out against current `apps/studio` — some satisfied directly (provider-override copy in `RunPanel.tsx`, the `ROUTER_MISSING_FALLBACK`/`BRANCH_MISSING_FALLBACK` compiler diagnostics, the `shell.canvasMinWidth`/`breakpoint.wide` tokens, the single-open `RunPanel` accordion), some moot because the mechanism they critiqued (drag/click palette, blank-template seed edge) was replaced outright by Phase 10's node launcher. Both closed as Done with cited evidence in Linear comments.

Forward-synced 2026-09-22: created Linear issues mirroring the 7 fully spec'd backlog rows from this session (the `studio-ux-gap-remediation-plan.md` and `studio-config-editor-and-console-plan.md` items) — [STO-592](https://linear.app/stockwise-productions-prototypes/issue/STO-592) through STO-596 created successfully (Diagnostics as navigation, Historical run waterfall, App-wide console/log drawer, Raw JSON/YAML config editor, Chat context binding); the last two (Remote/graph flow invocation from Chat, Collapsed reasoning/tool-use disclosure) were rejected by Linear — the workspace is at its free-plan issue cap. Create those two manually once the plan limit is resolved; their rows in the addendum table below are flagged accordingly. Did not sync the rest of the roadmap's P0-P3 addendum (only these 7 have full specs ready to become tickets) — check Linear before starting UX work in case something new lands there un-synced, and re-run this sync when other addendum rows get their own specs.

## Documentation Contradictions to Resolve

| Doc / area | Current contradiction | Required update |
| --- | --- | --- |
| `README.md` | Still describes a playground POC with exactly six node types and `apps/playground` as the primary UI. | During Phase 6 docs, rewrite around `apps/studio`, current node/runtime capabilities, and the graph-native control-plane positioning. |
| Root `AGENTS.md` | "Where to work" table still lists `apps/playground/` (Vite/React) as the Playground path; `apps/playground` does not exist on disk. | Update the table to `apps/studio/` (Next.js), matching the app that's actually deployed. |
| `studio-consolidation-plan.md` | Locks Next.js 15 studio and shadcn/local UI primitives; attached UX reference recommends MUI shell patterns and newer dependency baselines. | Translate UX patterns into the current studio stack unless a separate design-system migration is approved. Do not silently switch to MUI. |
| Existing shipped UX plans | Focus on playground shell/panel polish. | Treat them as historical shipped work; use Studio UX Revision as the forward UX plan. |
| Existing validation scope | Mostly structural/config validation. | Extend toward contracts, policy overlays, compatibility reports, and simulation. |
| Existing runtime framing | LangGraph is central to execution. | Keep LangGraph first, but document canonical graph IR and runtime adapter boundaries. |

---

## Recommended phases

### Phase 5 — Ship (P0)

1. ~~QA shell layout branch at full resolution (Chrome + Comet).~~
2. ~~Merge to `master`.~~
3. ~~Add `origin` remote and push to enable GitHub Actions CI.~~ Done — see `.github/workflows/ci.yml`.

### Phase 6 — Canvas identity (P1, high impact)

**Shipped 2026-09-09** — see the "Completed / in flight" table above.

1. ~~**Node color + shape taxonomy** — map each `NodeType` to token set; update `GraphNodeView` and legend in palette tooltips.~~
2. ~~**Blueprint background** — replace flat dark pane; ensure dots/grid readable with node colors.~~
3. ~~Lock brief design spec (`docs/planning/features/canvas-visual-language-plan.md`) before implementation if scope grows.~~

### Phase 7 — Shell resilience UX (P1, high utility)

**Shipped 2026-09-09** — see the "Completed / in flight" table above.

1. ~~**Loading shimmers** for async surfaces (graph load, compile, run, model catalog).~~
2. ~~**Empty states** audit — every list/log/preview region.~~
3. ~~**Collapsible rails** — section headers with chevron + persisted state; respect `prefers-reduced-motion`.~~

### Phase 8 — Operator + depth (P2–P3)

Dev CLI Phase 2 (factory), canvas orientation Phase E. Vitest harness and AGENTS.md shipped. Ultra-wide layout tokens shipped 2026-09-09.

### Phase 9 — P1 rollout (P1)

Full sequencing, exit gates, and UX constraints in [p1-rollout-plan.md](features/p1-rollout-plan.md).

1. **Slice A — Semantic release comparison.** Diff two `GraphRelease`s by behavior, not raw JSON.
2. **Slice B — Fixture-based simulation** (subsumes subgraph stubbing). Mock/recorded node output, no live tool/LLM calls.
3. **Slice C — Historical replay.** Read-only replay of a `RunGraphSnapshot` with frozen tool outputs.
4. **Slice D — Routing policy lab.** Dataset-driven route comparison; depends on Slice B's execution engine.
5. **Parallel track — versioned reusable entity registry.** Lower priority than A–D; no slice depends on it.

All P1 UI ships as canvas-anchored HUD/rail/drawer panels (`apps/studio/components/workbench/panels.ts`), never a new standalone route — including migrating the existing `/runs/[graphId]` page into a HUD panel.

### Phase 10 — Studio shell UX remediation (P1–P2) — Shipped

Full gap table and rationale in [studio-shell-ux-gap-analysis.md](features/studio-shell-ux-gap-analysis.md) — the formal HUD-anchored-shell review against `studio-ux-revision-plan.md`, following up on the `/runs/[graphId]` gap Phase 9 already named.

1. **Slice A — Close constraint violations.** Migrated `/runs/[graphId]` and `/analytics` into HUD panels; resource-registry HUD panels gained inline edit; resolved the node inspector's mutual-exclusivity friction with Run/Releases/Routing-lab.
2. **Slice B — Selection dock rebuild.** Configure/I-O/Policy/Run tabs on the node inspector, node-scoped policy-exception surfacing, a "nothing selected" workflow summary.
3. **Slice C — Run/Debug/canvas affordances.** A labeled "Validate" action, "Run from selected node," "Debug run," a searchable node launcher, typed-port/compatible-target connect feedback, a consolidated Run split-button. ("Run with production inputs" excluded — undefined anywhere.)
4. **Slice D — Lower-priority polish.** Focus mode, node-card summary line, a sortable run-history data grid, and a styling-ownership doc (`apps/studio/AGENTS.md`). The five resource registries deliberately stay as card grids rather than being converted to data grids — see the gap-analysis doc's Slice D note.

Large-graph complexity management (subgraphs, collapse/expand, dependency search, graph health score — named in `graph-native-control-plane-plan.md`) is explicitly out of this phase's slices and is follow-on work tracked separately. The knowledge-base UI, previously listed alongside it, has since shipped.

---

## Scoring rationale (requested items)

### 1. Color-coded nodes, shape variation, blueprint background

| Dimension | Rating | Rationale |
| --------- | ------ | --------- |
| Priority | **P1** | Depends on canvas layout fix (P0); highest demo “wow” per engineering hour after ship. |
| Impact | **High** | Graph is the product surface; grayscale nodes hide the six-type taxonomy the POC proves. |
| Utility | **High** | Faster orientation for new users; aligns with palette/inspector copy; supports future node-type expansion. |

### 2. Empty states, loading shimmers, collapsible panels

| Dimension | Rating | Rationale |
| --------- | ------ | --------- |
| Priority | **P1** | Complements Phase 6 visually; can parallelize (shell vs canvas tracks). |
| Impact | **High** | Removes “broken app” feel during load and on first visit; collapsible rails reclaim canvas on laptops. |
| Utility | **High** | Reuses shell patterns already specified; shimmers cheaply improve perceived performance without backend changes. |

---

## Related docs

- [Planning index](README.md) — locked feature specs
- [Strategic design](strategic-design.md) — graph-native product and studio UX direction
- [Graph-native control plane plan](features/graph-native-control-plane-plan.md)
- [Studio UX revision plan](features/studio-ux-revision-plan.md)
- [Studio UX gap remediation plan](features/studio-ux-gap-remediation-plan.md) — diagnostics navigation, run waterfall, Chat context/invocation/disclosure
- [Studio config editor and console plan](features/studio-config-editor-and-console-plan.md) — raw JSON/YAML config editor, app-wide console drawer
- [P0 graph foundation design](features/p0-graph-foundation-design-plan.md)
- [README.md](../../README.md) — run instructions, CI, EDD scope boundary
