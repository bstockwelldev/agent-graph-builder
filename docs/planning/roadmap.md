---
title: Agent Graph Builder POC — product roadmap
last_updated: 2026-09-23
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
| Mobile selection dock fix (covered the entire viewport, no dismiss) | Shipped 2026-09-22 | Reported with a screenshot: the "Workflow summary"/node-edge inspector dock force-rendered full-viewport on every compact page load with no close button when nothing was selected. Root cause: (1) close button gated behind `selectedNode \|\| selectedEdge`, (2) hardcoded `top-24` ignored the HUD's real, wrapping height (`hudBottom` was already measured for `EmptyGraphCoach` but never consumed here), (3) `max-h-[75vh]` wasn't bound to actual remaining viewport. Fixed in `GraphEditor.tsx`: the "nothing selected" case now defaults to a small collapsed, tappable strip instead of a forced full sheet; close button always renders; position/height now derive from `hudBottom` and actual remaining viewport. Linear sync attempted but rejected — workspace still at its free-plan issue cap (same block noted below); tracked here only. |

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
| ~~**P0**~~ | ~~**Canonical typed graph schema and immutable versioning**~~ | High | Foundation | **Shipped 2026-09-20** as part of "P0 graph foundation (Slices A-D)." Confirmed 2026-09-22 against code: `backend/app/models.py` has `GraphRelease` with `document_fingerprint`/`semantic_fingerprint`, `RunGraphSnapshot`; draft/release lifecycle and idempotent publish live in `backend/app/releases.py` (206 lines). See [p0-graph-foundation-design-plan.md](features/p0-graph-foundation-design-plan.md)'s "P0 is done only when" checklist — every criterion there is met. |
| ~~**P0**~~ | ~~**Graph-aware validation for structure, ports, schemas, and policy**~~ | High | Reliability | **Shipped 2026-09-20**, same slice. Confirmed: `backend/app/ports.py` (253 lines — port resolution/projection) and `backend/app/contracts.py` (436 lines — the four-pass structural/contract/policy-readiness/capability validator with the full blocking-code list from the design doc) both exist and match the spec closely. |
| ~~**P0**~~ | ~~**Studio UX revision: selection-driven workflow IDE**~~ | High | Core UX | **Superseded by Phase 10 (Shipped).** Rail/drawer switcher, rebuilt toolbar, selection dock (Configure/I-O/Policy/Run tabs), canvas node launcher, typed-port/compatible-target feedback, and scoped run/debug actions all shipped — see [studio-shell-ux-gap-analysis.md](features/studio-shell-ux-gap-analysis.md)'s Tier 1/2 tables. The only piece of `studio-ux-revision-plan.md`'s scope still open is large-graph complexity management, which is tracked on its own as the P3 row below (not a P0 gate). |
| ~~**P0**~~ | ~~**LangGraph adapter as first compiler/runtime target**~~ | High | Execution | **Shipped 2026-09-20**, same slice. Confirmed: `backend/app/adapters.py` has the `RuntimeAdapter` Protocol and `LangGraphAdapter` class with an explicit `CapabilityMatrix`, exactly matching the design doc's "LangGraph adapter boundary" section — not just "kept as executor," a real adapter boundary exists. |
| ~~**P0**~~ | ~~**Run timeline linked to nodes and edges**~~ | High | Debug loop | **Shipped 2026-09-20**, same slice, with one named gap. Confirmed: `GraphRunIdentity` (release/fingerprint/compiler-version pinning), route-decision visibility, and `human_gate` pause/resume (`RUN_PAUSES`, `RunPauseState`, `node.paused`/`run.paused`/`run.resumed` events in `runtime.py`) all exist. **Not implemented:** per-node retries — `grep` for retry/retries/max_attempts across `nodes.py`/`runtime.py`/`node_configs.py` returns nothing. Retries were never a listed P0 exit criterion in `p0-graph-foundation-design-plan.md` itself (only named in this row's own summary text), so this isn't a broken P0 promise — but it's a real, currently-unscoped gap. Not re-added as its own backlog row here; flag for a future pass if per-node retry policy becomes a priority. |
| ~~**P1**~~ | ~~**Diagnostics as a navigation system**~~ | High | Debug loop | **Shipped 2026-09-22.** Clicking a diagnostic now pans/zooms the canvas onto its node/edge (`FlowCanvas`'s new `focusRequest` prop) and opens the right `NodeInspector` tab by category (`lib/diagnostics.ts`'s new `tabForDiagnostic`). All acceptance criteria met except one deliberate simplification (reuses existing selection highlight rather than inventing a new one) — see [studio-ux-gap-remediation-plan.md §1](features/studio-ux-gap-remediation-plan.md#1-diagnostics-as-a-navigation-system) for the full status. Linear: [STO-592](https://linear.app/stockwise-productions-prototypes/issue/STO-592). |
| ~~**P1**~~ | ~~**App-wide console/log drawer**~~ | High | Debug loop | **Shipped 2026-09-22.** New global "Console" panel (Logs/Warnings/Errors/Run events tabs) — client-side errors from 5 existing `console.error` sites now also surface here, live run events mirror in via a second SSE subscriber, and entries deep-link back to the canvas. Two pragmatic scope decisions (right-side floating panel reusing existing infra rather than a new bottom-drawer primitive; unread badge lives on the command-palette entry rather than a nonexistent icon-button row) — see [studio-config-editor-and-console-plan.md §7](features/studio-config-editor-and-console-plan.md#7-app-wide-consolelog-drawer) for full status. Linear: [STO-594](https://linear.app/stockwise-productions-prototypes/issue/STO-594). |
| ~~**P1**~~ | ~~**Semantic graph diffs and review workflow**~~ | High | Differentiator | **Shipped, confirmed 2026-09-22.** `fingerprint.py:219` `diff_graphs`, `releases.py:175` diff endpoint, `ReleasesPanel.tsx` compare UI, `test_release_diff.py`. **Named gap:** compares two releases only, not a release against an arbitrary in-canvas draft. Slice A of [p1-rollout-plan.md](features/p1-rollout-plan.md). |
| ~~**P1**~~ | ~~**Fixture-based simulation and deterministic stubbing**~~ | High | Differentiator | **Shipped, confirmed 2026-09-22.** `simulate.py:72`, `test_simulate.py`. Slice B of [p1-rollout-plan.md](features/p1-rollout-plan.md). |
| ~~**P1**~~ | ~~**Historical replay and counterfactual debugging**~~ | High | Differentiator | **Shipped, confirmed 2026-09-22.** `replay.py:109`, `test_replay.py` — read-only replay of a `RunGraphSnapshot` with frozen tool outputs. **Named gap:** counterfactual modes (alternate model/router/retriever/node versions) aren't built — only frozen-replay of the original run exists. Slice C of [p1-rollout-plan.md](features/p1-rollout-plan.md). |
| ~~**P1**~~ | ~~**Historical run waterfall**~~ | Medium | Debug loop | **Shipped 2026-09-22.** New "Waterfall" section in the run HUD panel (`RunPanel.tsx`), one bar per node, bidirectionally linked to canvas selection. No backend work needed — `NodeTrace`/`RunSummary` timestamps already carried everything. All acceptance criteria met except retries-as-sub-segments, which has nothing to render (no retry mechanism exists anywhere in the runtime). See [studio-ux-gap-remediation-plan.md §2](features/studio-ux-gap-remediation-plan.md#2-historical-run-waterfall) for full status. Linear: [STO-593](https://linear.app/stockwise-productions-prototypes/issue/STO-593). |
| ~~**P1**~~ | ~~**Raw JSON/YAML config editor (node/edge/graph)**~~ | Medium | Escape hatch / power-user debug | **Shipped 2026-09-22 (both phases).** New "Raw" tab on `NodeInspector` (node config) and a "Raw" section on `EdgeInspector` (kind/condition only — the only fields the app actually applies from an edge patch), plus graph-level Export/Import JSON buttons in the HUD toolbar, validated against the SDK's real `graphDefinitionSchema`. YAML was not built (optional per spec, judged not worth it once JSON alone served the need); no heavy editor dependency added. See [studio-config-editor-and-console-plan.md §6](features/studio-config-editor-and-console-plan.md#6-raw-jsonyaml-config-editor) for full status. Linear: [STO-595](https://linear.app/stockwise-productions-prototypes/issue/STO-595). |
| ~~**P1**~~ | ~~**Versioned reusable entity registry**~~ | Medium | Scale | **Shipped, confirmed 2026-09-22.** `resource_versions.py`, `resource-version-history.tsx`, `test_resource_versions.py`. Parallel track in [p1-rollout-plan.md](features/p1-rollout-plan.md). |
| ~~**P1**~~ | ~~**Routing policy lab**~~ | High | Differentiator | **Shipped, confirmed 2026-09-22.** `routing_lab.py`, `RoutingLabPanel.tsx`, `test_routing_lab.py`. **Named gap:** dataset-driven comparison is graph-vs-graph only, not graph-vs-release. Slice D of [p1-rollout-plan.md](features/p1-rollout-plan.md). |
| **P2** | **Cross-cutting policy overlays** | High | Enterprise | First slice shipped: `policies.py` (17 tests). **Named gap:** rules are hard-coded constants, not yet configurable — no compile/deploy gates or exception-expiry UI. |
| ~~**P2**~~ | ~~**Chat: bind the scratchpad to graph/selection/run context**~~ | Medium | Core UX | **Shipped 2026-09-22.** `ChatPanel.tsx` now sends a `ChatContext` (current canvas snapshot, selection, run) with each message; the backend (`chat_context.py`'s `build_chat_system_prompt`) turns it into a system prompt covering graph summary, validation diagnostics, selected node/edge, and run/trace failures — never persisted to the transcript. "Include context" toggle, on by default; hidden with no graph open. Full design spec + acceptance criteria: [studio-ux-gap-remediation-plan.md §3](features/studio-ux-gap-remediation-plan.md#3-chat-bind-the-scratchpad-to-graphselectionrun-context). Linear: [STO-596](https://linear.app/stockwise-productions-prototypes/issue/STO-596). |
| **P2** | **Remote/graph flow invocation from Chat** | Medium | Differentiator | Confirmed gap: Chat can never trigger graph execution today. Unblocked now that the Chat context-binding row above has shipped; still depends on releases (`p0-graph-foundation-design-plan.md`) for version/environment resolution. Full design spec + acceptance criteria: [studio-ux-gap-remediation-plan.md §4](features/studio-ux-gap-remediation-plan.md#4-remoteflow-invocation-from-chat). Linear: [STO-600](https://linear.app/stockwise-productions-prototypes/issue/STO-600). |
| **P2** | **Collapsed reasoning/tool-use disclosure in Chat** | Low | Polish | Confirmed gap: there's currently no tool-call/reasoning trace to disclose because the scratchpad bypasses the graph engine. Unblocked now that Chat context-binding has shipped; the remote-invocation row above is still a prerequisite. `components/ai-elements/*` (already in the tree, from Vercel's AI Elements) is the natural place to add this. Full design spec + acceptance criteria: [studio-ux-gap-remediation-plan.md §5](features/studio-ux-gap-remediation-plan.md#5-collapsed-reasoningtool-use-disclosure-in-chat). Linear: [STO-601](https://linear.app/stockwise-productions-prototypes/issue/STO-601). |
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

### Phase 9 — P1 rollout (P1) — Shipped

Full sequencing, exit gates, and UX constraints in [p1-rollout-plan.md](features/p1-rollout-plan.md) (status updated 2026-09-22 from `proposed` to `shipped`).

1. ~~**Slice A — Semantic release comparison.**~~ Diff two `GraphRelease`s by behavior, not raw JSON. Shipped: `fingerprint.py:219`, `releases.py:175`, `ReleasesPanel.tsx`, `test_release_diff.py`.
2. ~~**Slice B — Fixture-based simulation**~~ (subsumes subgraph stubbing). Mock/recorded node output, no live tool/LLM calls. Shipped: `simulate.py:72`, `test_simulate.py`.
3. ~~**Slice C — Historical replay.**~~ Read-only replay of a `RunGraphSnapshot` with frozen tool outputs. Shipped: `replay.py:109`, `test_replay.py`. Counterfactual replay modes (alternate model/router/retriever/node versions) are not built.
4. ~~**Slice D — Routing policy lab.**~~ Dataset-driven route comparison; depends on Slice B's execution engine. Shipped: `routing_lab.py`, `RoutingLabPanel.tsx`, `test_routing_lab.py`. Compares graph-vs-graph only, not against a release.
5. ~~**Parallel track — versioned reusable entity registry.**~~ Lower priority than A–D; no slice depends on it. Shipped: `resource_versions.py`, `resource-version-history.tsx`, `test_resource_versions.py`.

All P1 UI ships as canvas-anchored HUD/rail/drawer panels (`apps/studio/components/workbench/panels.ts`), never a new standalone route. ~~**Named gap:** `/runs` and `/runs/[graphId]` remain standalone pages.~~ Closed 2026-09-23 by Phase 11 Wave 2 — both now redirect into the graph's Run panel.

### Phase 10 — Studio shell UX remediation (P1–P2) — Shipped

Full gap table and rationale in [studio-shell-ux-gap-analysis.md](features/studio-shell-ux-gap-analysis.md) — the formal HUD-anchored-shell review against `studio-ux-revision-plan.md`, following up on the `/runs/[graphId]` gap Phase 9 already named.

1. **Slice A — Close constraint violations.** Migrated `/runs/[graphId]` and `/analytics` into HUD panels; resource-registry HUD panels gained inline edit; resolved the node inspector's mutual-exclusivity friction with Run/Releases/Routing-lab.
2. **Slice B — Selection dock rebuild.** Configure/I-O/Policy/Run tabs on the node inspector, node-scoped policy-exception surfacing, a "nothing selected" workflow summary.
3. **Slice C — Run/Debug/canvas affordances.** A labeled "Validate" action, "Run from selected node," "Debug run," a searchable node launcher, typed-port/compatible-target connect feedback, a consolidated Run split-button. ("Run with production inputs" excluded — undefined anywhere.)
4. **Slice D — Lower-priority polish.** Focus mode, node-card summary line, a sortable run-history data grid, and a styling-ownership doc (`apps/studio/AGENTS.md`). The five resource registries deliberately stay as card grids rather than being converted to data grids — see the gap-analysis doc's Slice D note.

Large-graph complexity management (subgraphs, collapse/expand, dependency search, graph health score — named in `graph-native-control-plane-plan.md`) is explicitly out of this phase's slices and is follow-on work tracked separately. The knowledge-base UI, previously listed alongside it, has since shipped.

### Phase 11 — Graph-native workspace redesign (P1–P2) — Waves 1–4 shipped

Full audit, slices, and acceptance criteria in [studio-graph-workbench-redesign-plan.md](features/studio-graph-workbench-redesign-plan.md) — the third-party "Deep UI/UX Design Review"'s remaining change sets, re-audited against code 2026-09-23 (its diagnostics/waterfall/Chat items were already covered by [studio-ux-gap-remediation-plan.md](features/studio-ux-gap-remediation-plan.md)).

1. ~~**Wave 1 — Graph workbench + rich nodes.**~~ **Shipped 2026-09-23.** Single-row graph-first header (Validate chip, Run▾, icon tools, `···` overflow; ⌘S), one Layout menu (direction/spacing/minimap), rich node cards (status pill + issue badge, richer summaries, I/O row, NodeToolbar, hover preview, stale state, user-given names via `extensions.label` excluded from semantic fingerprints), shared node geometry + saved-position-preserving layout, and a `LabeledEdge` whose animation means "executing". Linear: [STO-602](https://linear.app/stockwise-productions-prototypes/issue/STO-602).
2. ~~**Wave 2 — IA + selection model.**~~ **Shipped 2026-09-23.** 72px icon rail (Graphs · Resources · Analytics) + `/resources` hub + resource tab strip; graph-route URL state (`?node/?tab/?edge/?run/?panel`); NodeInspector History tab; graph-scoped Analytics panel over new per-node backend rollups (`node_analytics.py`); `/runs` pages retired into the Run panel (multi-select dataset capture, clickable event log) with redirects. Linear: [STO-603](https://linear.app/stockwise-productions-prototypes/issue/STO-603).
3. ~~**Wave 2.5 — Inspector & Run console v2.**~~ **Shipped 2026-09-23.** Contrast tokens (`surface.inset/card`, `border.*`, `text.secondary`) and a graph-kit form set (`Field`, `Combobox`, `Toggle`, `NumberStepper`, `SegmentedControl`, `IconTabs`, `Group`, `PanelFrame`, `TemplateEditor` with `{var}` highlighting/autocomplete); NodeInspector with an identity header (inline name, actions), icon tabs, grouped config and per-field diagnostics; a Run console with **one field per input-node variable** (run input is now `Record<string,string>`), a provider chip, a sticky Run/Validate/⋯ bar and tabbed Observe with counts. Linear: [STO-606](https://linear.app/stockwise-productions-prototypes/issue/STO-606).
4. ~~**Wave 3 — Motion + accessibility.**~~ **Shipped 2026-09-23.** Drawers slide in and out (`usePresence`), menus/popovers scale from their trigger, Escape closes the active workbench panel (deferring to open menus/dialogs) with focus returned to the opener, focus traps on modal drawers/overlays, a global `prefers-reduced-motion` guard (+ `scrollBehavior()` for JS scrolls), and a scoped `:focus-visible` ring across graph surfaces. Linear: [STO-604](https://linear.app/stockwise-productions-prototypes/issue/STO-604).
5. ~~**Wave 4 — Resource binding + inspector consolidation.**~~ **Shipped.** Linear: [STO-605](https://linear.app/stockwise-productions-prototypes/issue/STO-605).
   - ~~**4a — Resource binding.**~~ **Shipped 2026-09-23.** Prompt/LLM/tool-loop nodes bind to Prompts and LLM profiles (`promptId`, `systemPromptId`, `llmProfileId`; tools via `toolName`) as live references frozen on release; `backend/app/bindings.py` drives compile validation (`UNRESOLVED_RESOURCE_BINDING`, field-scoped), execution, release snapshots and `GET /api/{kind}/{id}/usages`; SDK mirror checked against `contract/node-bindings.json`; Inline/Library field switch, Open-from-node editing, "Used by", named node cards.
   - ~~**4b — Inspector consolidation.**~~ **Shipped 2026-09-23.** `resource-kinds.tsx` (one config per registry) + `ResourceEditorDialog` (Overview/Usage/History) + `ResourcePage` (`?id=&tab=` deep links, delete-in-use warning) drive both the five pages (now 3-line mounts) and the workbench panels; `resourceFormConfigs.tsx` deleted (~1.9k duplicated lines).

Deferred (cross-language contract change, not scheduled): typed multi-port handles — router/branch declare two outputs but draw one handle, and edges never set `source_port`.

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
