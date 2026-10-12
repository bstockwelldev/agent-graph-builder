# Model selection clarity: assessment and plan (v2, for review)

Status: **decisions 1-3 recorded; Phase 0 reproduced; awaiting go-ahead for Phase 1; nothing implemented.** Supersedes the v1 change set; v1's C1-C6 survive as Phase 1 below.
Only code change so far: the ChatPanel readiness guard (the 403 fix).

## 1. Summary

The app has five places that choose a provider/model, and they follow three different override rules. One layer is displayed but has no effect, and a run action silently rewrites saved graphs. The deepest cause is structural: **a model name is only meaningful with its provider, but the app stores the two at different scopes.** Provider is run-only for LLM nodes; model lives on the node, the profile, and the run. Every other symptom (dead picker, "qwen2.5:3b via stub", spurious "(copy)" forks, invalid pins) follows from that split plus the sync that papers over it.

Recommendation: a staged plan. Phase 1 makes the UI truthful without changing behaviour. Phase 2 makes existing layers real and recorded. Phase 3 (per-node provider, graph default) is deferred to the roadmap by decision.

## 2. How resolution works today (verified in code)

| Scope | Set where | Effect at runtime |
|---|---|---|
| Run | Run panel chip; local state, default `stub`, unsaved (`RunPanel.tsx:380`) | Sole provider for `llm`/`tool_loop`. Run model beats everything (`runtime.py:613`). |
| LLM / tool_loop node | Inspector; defaults `ollama` / `qwen2.5:3b` | `config.provider` is **never read**. `config.model` used if nothing above overrides. |
| LLM profile bound to node | `llmProfileId` | Only `model` is read (`nodes.py:196`). **`model_provider` is ignored.** Only agent runs use it (`agents.py:99`). |
| Agent | Agent's profile | Default provider/model for the run; explicit run choice wins. |
| decision / extract node | Own provider, default `stub` | Own provider; **ignores the run provider** (`nodes.py:491`). |
| Chat session | Fixed at creation | Separate. `/run` from chat sends the session's provider as the run override. |
| Eval, replay, simulate | Own parameters | Eval takes provider/model (default stub); replay has per-node `model_overrides`; simulate forces stub. |

Also true:
- No graph-level default exists.
- The intended design was written down: "Node default provider/model. Execute panel overrides all LLM nodes" (`canvas-authoring-literacy-plan.md:310`). The override was implemented by **writing the run selection into every LLM node and saving** (`modelCatalog.ts:12`, called at `GraphEditor.tsx:1683`, `:1882`).
- Existing docs disagree on precedence: `resource-forms-consistency-plan.md:71` says a profile "overrides the node's provider/model"; code only applies its model, and the run model beats it.
- After a run, the resolved provider and model per LLM node **are** recorded in the trace input (`nodes.py:280`). `RunSummary` records provider only, not the requested model, and nothing records *why* a value won.
- The run card already calls the provider an **"env"** (`run-card.tsx:116`) and the chat passes `environment=`. The code's own mental model is "provider = execution environment".

Defects: D1 dead setting displayed; D2 runs rewrite the graph; D3 half-sync ("qwen2.5:3b via stub"); D4 *(corrected in Phase 0)* the seeded read-only demo is protected: an unedited demo run neither mutates nor forks, but the first edit forks it to an editable "(copy)", and **on any editable graph a run rewrites the saved nodes**; D5 placeholder shown as real; D6 no effective value before a run; **D7 profile provider ignored on nodes; D8 pickers offer providers that cannot work in this deployment (the original 403).**

## 3. Industry comparison

Sourcing note: items marked (fetched) come from primary docs read this session; (search) from search snippets, including third-party guides; (background) from general knowledge, not verified now.

| Practice | What others do | This app |
|---|---|---|
| **Most specific scope wins** | OpenAI Agents SDK: per-agent `model` is explicit; the run-level model applies to agents that set none; `OPENAI_DEFAULT_MODEL` is a process fallback; docs say to "mix per-agent models" (fetched). CrewAI: per-agent `llm`, env-var default (search). | **Inverted**: run beats node, silently and persistently. |
| Where a model lives | n8n: on the chat-model sub-node with its own credential (search, third-party). Dify: on the node; workspace defaults serve system tasks (search). Langflow: per component; global variables for credentials (search). | Split across scopes (the root cause above). |
| Runtime override | LangChain/LangGraph: `config["configurable"]`, namespaced with `config_prefix` so each model is addressed separately; never saved into the graph (fetched). | Override exists but is persisted and un-namespaced. Replay's `model_overrides` is closer to the standard. |
| Qualified model ids | `provider/model` or `provider:model` is common (LiteLLM, AI gateways, LangChain) (search, background). | Separate `provider` and `model` fields. |
| Aliases / profiles | LiteLLM `model_name` aliases decouple apps from providers (search). | `LlmProfile` is the right idea; its provider is dropped on nodes. |
| Credentials separate from model | n8n credentials, Langflow global variables (search). | API-key field sits inside the run model popover (reasonable for BYOK demo, should be labelled). |
| Requested vs resolved | OpenTelemetry GenAI: `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.provider.name` (search). | Resolved model recorded per node; requested model and source are not. |
| Scoped-setting UX | VS Code settings scopes with "modified in" markers; DevTools shows declared vs computed with overridden values struck through (background). | No effective value, no source marker. |

**Assessment.** The run-level override is not wrong; as an explicit, temporary "test this graph on X" it matches LangGraph's runtime config and this repo's own replay feature. It also does real work here: the run provider is the **safety gate** that keeps the public demo and CI on Stub. What deviates from the standard is how it is done: invisible, persisted, and combined with a provider field that does nothing. Note that flipping to "node pin wins" would break the demo gate and CI determinism unless the override stays the default, so the standard cannot simply be copied.

## 4. Options

| | A. Honest override | B. Industry-standard cascade | C. Staged (recommended) |
|---|---|---|---|
| Idea | Keep run-beats-node; make it visible and ephemeral | Node pin > graph default > env default; Run override opt-in | A now; B's capabilities only if needed |
| Behaviour change | None | Large; demo/CI safety must be re-built | None in P1; small in P2 |
| Backend | None | Per-node provider, graph default field, per-node gating | None until P3 |
| Per-node mixed providers | No | Yes | Only in P3 |
| Risk | Low | High | Low then gated |

## 5. Target model (Phase 1 documents it; later phases implement the rest)

One reference per scope: **a (provider, model) pair always travels together.** Resolution, most to least specific:

1. **Run override**: explicit selection in the Run panel, applies to this run only (default behaviour unchanged: Stub).
2. **Node pin**: bound profile, else inline `model`.
3. **(Phase 3) Graph default.**
4. **Environment default**: the provider's default model (`provider_defaults.py`).

Provider vocabulary: say **"Run on"** (environment) for the provider and **"Model"** for the model, matching the code's "env" language.

## 6. Plan

### Phase 0: reproduce (DONE 2026-10-12)
Run in the browser against the real backend (non-demo mode, Stub chip), seeded demo graph `demo_classify_and_route`:

| Step | Observed |
|---|---|
| Saved config of both LLM nodes | `model: qwen2.5:3b`, **no `provider` key** |
| Node cards before any run | `qwen2.5:3b · via ollama` (a provider nobody set; D1/D5) |
| Run the unedited demo on Stub | Succeeded (`provider: stub`); **no fork, saved nodes unchanged, cards still `via ollama`** (read-only guard: `persistForRun` falls back to the unsynced graph) |
| Edit the demo (add a node, save) | Forks to `Classify & Route (demo) (copy)`; nodes still no provider |
| Run the copy on Stub | Cards become `qwen2.5:3b · via stub`; **saved config now has `provider: "stub"` on both LLM nodes**, model still `qwen2.5:3b` (D2, D3 confirmed; this is the state in the original screenshot) |

Consequences for the plan: D4 as first written was wrong (corrected above); the visible "via stub" mismatch needs an *editable* graph; the fix (1.1) is unchanged because the persisting sync is the cause either way. Also: a clean checkout needs `pnpm install --frozen-lockfile` before the Studio compiles (missing `@codemirror/*`), which also clears the `tsc` errors seen earlier.

### Phase 1: make the UI truthful (no semantic change; two PRs)
PR 1 (fixes D2-D3):
- **1.1** Stop persisting the run selection (`GraphEditor.tsx` ~L1683, ~L1882; delete `applyRunSelectionToLlmNodes`).
- **1.2** `RunSelectionContext` (provider/model, in memory, initial Stub); `RunPanel` reads it.
- **1.3** Effective model on node cards with provenance: `Groq · llama-3.3-70b · run`, `… · profile Fast`, `… · pinned`, `… · default`. New pure `effectiveModelFor` in `nodes.ts`, optional `runSelection` in `SummaryContext` (additive). Placeholder `qwen2.5:3b` never shown as a real model.
- **1.4** Parity guard: shared golden cases (JSON) asserted by both vitest (`effectiveModelFor`) and pytest (backend resolution), so the UI cannot drift from the runtime.

PR 2 (fixes D1, D5-D6, D8):
- **1.5** Inspector: remove the dead provider picker on `llm`/`tool_loop`; add "Model pin" and a read-only "Runs on: <run provider>" line; decision/extract hint "uses its own provider, ignores the Run panel".
- **1.6** Run control: tooltip/title "Model for this run, overrides node pins"; line "Applies to N LLM nodes; M decision/extract nodes use their own provider".
- **1.7** `ProviderModelPicker`: mark providers that are not ready (demo gating, Ollama unreachable) with the reason, using the existing `providers.ready` check (cached per provider). Applies to Run panel, node inspector, chat, counterfactual form.
- **1.8** Chat header chip `provider · model` ("fixed at creation; `/run` uses it").
- **1.9** Docs: one "Model resolution" reference (the table in section 2, kept current); correct `resource-forms-consistency-plan.md:71` and the `canvas-authoring-literacy-plan.md:310` copy.

### Phase 2: make existing layers real and recorded (small backend)
- **2.1** Record the requested model and a `model_source` (`run|profile|pin|default`) on each LLM node trace; add requested model to `RunSummary`. Naming aligned with OTel GenAI (`request.model`, `provider.name`).
- **2.2** Pre-run diagnostic when a bound profile's `model_provider` differs from the run provider ("Profile 'Fast' targets Groq; this run is on Stub, the run provider wins"). Surfaces D7 instead of dropping it silently.
- **2.3** Pre-run diagnostic when a pinned model is not valid for the run provider.
- **2.4** Optional "Override node models" toggle on the Run panel, **default on** (preserves demo/CI safety). Off = pins win where the provider matches.

### Phase 3: deferred to the roadmap (decided 2026-10-12; not part of this effort)
Per-node provider honoured by the runtime (reuse the replay `node_chat_models` mechanism), graph-level default field, per-node ready/gating checks, provider-qualified model ids. Tracked in `roadmap.md`; revisit when mixed-provider graphs are actually needed.

## 7. Verification

- Scenarios, run in the browser and as e2e where cheap: S1 editable copy run on Stub (saved nodes unchanged after the run, labels show run source; unedited demo still does not fork); S2 change run provider/model (labels update live, nothing saved); S3 pin a model, run with no run model (shows pinned); S4 node with profile; S5 decision/extract node (labelled own provider); S6 public-demo mode, pick Groq (marked unavailable, reason visible; chat cannot create a dead session).
- Done means: for any node, a user can say what it will run on and why, **without running**, in one glance or one click.
- Unit: `effectiveModelFor` + parity goldens; inspector; GraphEditor "run does not mutate nodes"; picker readiness marks.
- Existing gates: `eslint --max-warnings 0`, `vitest`, backend pytest. `tsc` currently fails on missing `@codemirror/*` modules (unrelated).

## 8. Decisions and open questions

**Decided 2026-10-12:**

1. **Mental model confirmed**: provider = "Run on" (environment); model = which model there.
2. **Mixed providers per graph: deferred.** Phase 3 moves to the roadmap (P3, deferred) and is out of scope for this effort.
3. **Run override stays default-on** (protects the public demo and CI).

**Still open (defaults I will use unless told otherwise):**

4. **New-node defaults** (`ollama` / `qwen2.5:3b`): leave unchanged because of the "LLM model not pinned" policy rule.
5. **Release snapshots**: check whether any release/export consumer reads a node's saved `provider` before 1.1 lands (none found in the runtime).
6. **Public demo gating (1.7)**: in scope; it prevents the original 403.

## 9. Risks and what I'd cut

- The sync removal could break an e2e or a user habit of reading the model off the node label; check `e2e/specs` first.
- Existing graphs carry stale `provider` and run-written models; harmless, but old synced models will read as "pinned".
- Scope creep: Phase 3 is the part most likely to be speculative. P1 delivers the user-visible fix; ship it and look again before committing to P2/P3.
