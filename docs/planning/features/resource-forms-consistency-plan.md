# Resource forms, GenUI, and scope consistency plan

**Status:** Proposed 2026-09-29. Inventory from a review of the Resources
pages (Agents, Prompts, Tools, MCP, LLM profiles, GenUI) plus Analytics and
Policies, against how the graph canvas actually uses each kind.

Code of record: `apps/studio/components/studio/resource-kinds.tsx` (one
config per kind), `backend/app/resource_models.py`, `backend/app/bindings.py`
(`BINDING_FIELDS`), `components/graph/NodeInspector.tsx`.

## 1. Cross-cutting rules (apply to every kind)

| # | Rule | Today |
| --- | --- | --- |
| C1 | **Identity.** New entries get a generated id derived from the name (`slug(name)` + short suffix), shown read-only under the Name field with a "Customize id" link. After create the id is display-only with a copy button. Focus lands on **Name**, not Id. | Id is the first, focused, free-text field on create; disabled (but still an input) on edit. Prompt dialog still warns "Changing id may break existing refs", which edit mode no longer allows. |
| C2 | **References are pickers, never typed ids.** Anything that names another entity (graph, provider, model, MCP server, remote tool, prompt, profile) is a combobox over the real list, with "Open" to jump to it. | `default_flow_id`, `model`, `model_provider` are free text. |
| C3 | **Enums are selects.** Every `Literal[...]` field renders as a select or segmented control. | Provider is a text box whose placeholder lists the options. |
| C4 | **JSON fields validate.** Use the shared raw editor (JSON/YAML, parse error inline, Save disabled while invalid). | Tool parameters JSON is stored as typed even when invalid. |
| C5 | **One field set per kind, shared with the canvas.** The inspector control that edits a field on a node (e.g. `ProviderModelPicker`) is the one the resource form uses. | The LLM node uses `ProviderModelPicker`; the LLM-profile form uses two text boxes. |
| C6 | **Required fields are marked** and Save explains what's missing (today Save just stays disabled). | No markers; silent disabled Save. |
| C7 | **Descriptions match reality.** Nav and page copy only promise fields that exist. | "Agents: model, prompt, and tools together"; "LLM Profiles: provider/model/parameter presets"; "Prompts: versioned templates with variables". None of those fields exist. |
| C8 | **Every card shows "Used by N graphs"** from `GET /api/{kind}/{id}/usages` (already served), and delete warns with the list. | The Usage tab exists in the dialog; cards don't show it. |

## 2. Per-kind inventory

### Prompts (`PromptTemplate`: id, name, body)
- **Canvas use:** `prompt.promptId`, `llm/tool_loop.systemPromptId`. The node renders `{var}` placeholders against graph input variables.
- **Gaps:**
  - The body is a plain textarea. It should be the canvas's `TemplateEditor`: `{var}` highlighting and autocomplete, an expand editor, and a char count.
  - No declared variables. Add a derived, read-only "Variables: {question}, …" list parsed from the body, and warn when a binding graph doesn't supply one.
  - No description field, unlike every other kind.
- **Spec:**
  - Name: text, required.
  - Body: TemplateEditor, required.
  - Description: optional.
  - Variables: derived and read-only.

### Tools (`ToolDefinition`: id, description, parameters_json, requires_approval, mcp_server_id, mcp_tool_name)
- **Canvas use:** `tool.toolName` combobox over builtins plus the registry. `requires_approval` gates Run.
- **Gaps:**
  - **The MCP binding fields exist in the model but have no inputs.** The MCP page says "Tools bind via mcp_server_id + mcp_tool_name", yet nothing can set them.
  - There's no Name, so the card title is the raw id.
  - The Parameters JSON isn't validated (C4).
  - Nothing shows that builtins (`web_search`, `calculator`, `lookup_topic`) exist and can't be shadowed.
- **Spec:**
  - Name: required, new field.
  - Description.
  - **Source**, a segmented control with three options:
    - Mock: echo, today's default.
    - MCP: a server picker, then a remote tool picker filled from the server's `tools/list`. Picking a tool fills the parameters schema.
    - Builtin: read-only.
  - Parameters: a JSON Schema editor with validation. Read-only when it comes from MCP.
  - Requires approval.

### MCP servers (`McpServerConfig`: id, name, url, transport, enabled)
- **Canvas use:** indirect, through tools.
- **Gaps:**
  - Transport offers `sse` and `stdio`, but only `http` executes. The page text admits it; the select should disable those two with a "not yet" hint.
  - There's no auth or headers field, which most real servers need. This would be server-side only, held as a secret and never echoed back.
  - There's no **Test connection / Discover tools** action. `mcp/client.list_mcp_tools` exists but has no route.
  - There's no list of the tools this server exposes, or of which registry tools bind to it.
- **Spec:**
  - Name.
  - URL: validated as http(s).
  - Transport: `http` enabled, the others disabled.
  - Headers: a key/value editor with masked values. This needs a backend secrets field.
  - Enabled.
  - Actions: "Test connection", and "Discover tools", which can one-click create registry tools.

### LLM profiles (`LlmProfile`: id, name, model, model_provider, description)
- **Canvas use:** `llm/tool_loop.llmProfileId`, which overrides the node's provider/model at run time.
- **Gaps:**
  - Provider and model are free text (C2, C3, C5). A typo only fails at run time.
  - There are no generation parameters (temperature, max tokens), though the nav promises "parameter presets". The node doesn't carry them either, so add them to both, or drop the promise.
  - There's no default system prompt binding. The node has `systemPromptId`, and a profile is the natural place for a default.
- **Spec:**
  - Name.
  - Provider + Model: the shared `ProviderModelPicker`, required, with the model list from `/api/providers/{p}/models`.
  - Temperature / Max tokens: optional steppers. Needs backend support in the providers.
  - System prompt: a prompt picker, optional.
  - Description.

### Agents (`AgentProfile`: id, name, description, default_flow_id, system_instructions, optional_elements)
- **Canvas use:** **none.** No run, node, binding or chat path reads an agent profile. It's stored and editable, and nothing else.
- **Gaps:**
  - `default_flow_id` is a typed graph id. It should be a graph picker, labelled "Default graph".
  - "Optional elements (one per line)" has no defined meaning anywhere in the code.
  - The nav copy promises model, prompt and tools, which don't exist.
- **Decision needed:** either make Agents real, or hide the kind until it is. Making it real is recommended:
  - An agent = graph (required picker) + LLM profile (picker) + system prompt (picker) + tool allow-list (multi-select over tools).
  - Selectable in the Run panel and in Chat (`/run @agent`).
  - `optional_elements` would be dropped.

### Transforms (already consistent)
- It's the reference implementation for C3 and C4: a type segmented control, conditional fields and validation.
- Its tab exists but was cut off in the review screenshots. The tab strip needs an overflow affordance at that width (scroll or "More").

### Datasets (no page)
- Datasets are stored resources with versions of their own flow. They're created from the Run panel and routing lab, but have **no Resources page**: you can't browse, rename or delete them outside a graph panel.
- Add a Datasets page: list, fixtures preview, graph provenance, delete, "Open in routing lab".

### GenUI
- The component library shows two static examples. The runtime is missing the pieces that make a checkpoint useful:
  1. **Approve / Reject is not wired.**
     - `POST /api/runs/{id}/resume` supports `approve` and `reason`, and the SDK has `runs.resume`.
     - But the studio never calls it. A paused run shows "paused" with no way to continue.
     - GenUI `Button`s only `console.info` their `actionId`.
     - **Highest-priority gap.**
  2. **FormField values go nowhere.** Resuming should submit the surface's field values, e.g. `resume({approve, reason, values})`, into the gate's output. That's a backend change to `RunResumeRequest` and `compute_human_gate`.
  3. **Missing components:**
     - `Approval`: summary, approve/reject, and a reason.
     - `Chart`: bar/line/area over inline data or a JSON pointer into run state.
     - `Table`.
     - `Diagram`: Mermaid source, rendered client-side.
     - `KeyValue` / `Diff`, for "approve this change" views.
     - `Select` and `Checkbox` form fields.
     - `Markdown` text.
  4. **Data binding:** components can't reference run data. Add `{"$ref": "/nodes/llm_answer/output"}`-style pointers, resolved at render time from the paused run's state.
  5. **Authoring:** the node's `genuiCheckpointSurfaceJson` is a raw textarea. Use the raw editor with validation, a live preview, and "Insert example" from the library page.
  6. **Library page:** each component gets a card (preview, props table, JSON), plus a "Copy JSON" button.

## 3. Scope: workspace vs graph (Analytics, Policies, Resources)

**Today:**
- Graph-scoped views exist only inside the editor. The Analytics panel has a "This graph / Workspace" toggle; the Policies panel shows graph overrides.
- The top-level `/analytics` and `/policies` pages are workspace-only.

**Recommendation:** one shared **Scope** control in the page header of Analytics, Policies and every Resources page. It reads *Workspace ▾* and lists graphs, and it's kept in the URL (`?graph=<id>`) and remembered across pages.

- **Analytics:**
  - Workspace scope stays as it is.
  - Graph scope reuses the per-node rollups the panel already fetches (`GET /api/graphs/{id}/analytics`):
    - node table
    - success rate
    - p95
    - daily trend per graph
    - a release selector, to compare runs by release
  - Richer visuals, using the same Chart component as GenUI:
    - a runs/day stacked by status
    - a latency distribution
    - a provider/model mix
    - the top failing nodes, with links into the editor
- **Policies:**
  - Graph scope shows effective rules with their source (default / workspace / graph), edits the graph's overrides, and filters exceptions to that graph.
  - Workspace scope is unchanged, and read-only on the public demo (STO-626).
- **Resources:** graph scope filters each list to entries that graph uses (via `/usages`), which answers "what does this graph depend on?"

## 4. Proposed slices

1. **Run approvals (GenUI 1–2)** — **shipped 2026-09-29.** Paused runs name their gate (`RunSummary.paused_node_id`); the Run panel's checkpoint card renders the gate message and an interactive GenUI surface (token-styled `components/graph/ui/GenuiSurface.tsx`, also the inspector preview) with a reason and Approve / Reject; surface buttons dispatch `approve`/`reject`, other actionIds approve and are recorded as `values.action`; approved values become the run variable `{<gate_id>[field]}`. Still open: pause state is process-local, so on Vercel a resume can miss the paused instance (durable checkpoints are a follow-up). Original scope:
   - Approve / Reject with a reason in the Run panel, whenever a run is paused.
   - GenUI Buttons dispatch their `actionId`s.
   - Form values are submitted on resume (backend and SDK).
   - e2e: pause at a `human_gate`, approve, then reject.
2. **Form foundation (C1–C6)** — **shipped 2026-09-29.**
   - C1: Name comes first and is focused. On create the id follows the name (`slug_abcd`), with "Customize id" to edit it; after create it's display-only with a copy button (`components/studio/resource-fields.tsx`). Tools keep their name as the id, since tool nodes call it by that.
   - C2/C3/C5: LLM profiles pick the provider from a select over the chat providers and the model from the same catalog the canvas's `ProviderModelPicker` loads (`hooks/use-model-catalog.ts`, shared). A stored provider the API doesn't run is flagged.
   - C4: tool parameters must be a JSON object; the error shows inline and blocks Save.
   - C6: required fields are marked, and every kind has an `issues(form)` list that the editor shows beside the disabled Save ("To save: Add a name. Pick a model."). MCP URLs must be http(s).
   - C7: nav, page and dialog copy for Prompts, Tools, MCP and LLM profiles now describes only real fields.
   - The resource tab strip scrolls the current tab into view and fades the ends that have more tabs past them.
   - The agent's graph picker shipped with slice 6. Still open: prompt descriptions, the prompt body as a `TemplateEditor`, and "Used by N graphs" on cards (C8).
   - e2e: `e2e/specs/resource-forms.spec.ts`.
3. **Tools ↔ MCP** — **shipped 2026-09-29.**
   - MCP request headers (e.g. Authorization) are write-only secrets. They are stored under their own storage kind (`backend/app/mcp/secrets.py`), not in the server resource, so they never reach resource reads, versions, release snapshots or fingerprints. `GET/PUT /api/mcp-servers/{id}/headers` returns names only; `null` keeps a stored value. Runs and discovery send them, and deleting a server deletes them.
   - `POST /api/mcp-servers/{id}/discover` connects and lists the server's tools (`McpDiscovery`; an unreachable server is `ok: false`, not an error). It is off on the public demo (403 `mcp_discovery_disabled`), which shouldn't fetch visitor-chosen URLs on demand.
   - MCP page: the transport select disables sse/stdio ("not yet"); a headers editor shows stored names with masked, write-only values; "Test connection" lists tools with one-click "Add to registry" (`serverId.toolName`).
   - Tool form: a Source control (Mock / MCP server). MCP picks the server, then the server's tool; picking fills the description and a read-only parameters schema. If discovery fails, the tool name can be typed.
   - Tool writes reject a built-in's id (they'd never run: builtins dispatch first) and half an MCP binding.
   - Tools still have no separate Name: the tool node calls a tool by its id, so the id stays the name (slice 2).
   - e2e: `e2e/specs/mcp.spec.ts`, against `scripts/fake-mcp.mjs`.
4. **Scope control** — **shipped 2026-09-29.** One Scope picker (Workspace, or a graph) in the page header of Analytics, Policies and every Resources page (`hooks/use-graph-scope.ts`, `components/studio/scope-select.tsx`). It lives in `?graph=<id>` and is remembered across pages (localStorage); a remembered graph that no longer exists falls back to the workspace.
   - Analytics: graph scope shows the graph's success rate, P95, spend and per-node table (the canvas panel's `GraphAnalyticsView`; rows link into the editor) and its daily trend (`GET /api/analytics?graph_id=`). Workspace "By graph" rows switch the scope.
   - Policies: graph scope edits the graph's overrides (writable on the public demo, where workspace rules are read-only), labels unset rules "Inherit (<workspace value>)", badges each rule with where its setting comes from, and lists only that graph's exceptions.
   - Resources: graph scope lists only what the graph uses (`GET /api/graphs/{id}/resources`: node and edge bindings, the MCP servers behind its tools, agents built on it), with "Show all".
   - Not yet: the release selector and charts on graph-scoped Analytics (charts wait on slice 5's Chart component).
   - e2e: `e2e/specs/scope.spec.ts`.
5. **GenUI components (3–6):**
   - Approval, Chart, Table, Diagram, KeyValue/Diff, Select/Checkbox, Markdown.
   - `$ref` data binding.
   - The authoring editor.
   - Library cards.
6. **Agents decision:** make agents real (graph + profile + prompt + tools, selectable in Run and Chat) or hide the kind. **Decided: real; shipped 2026-09-29.**
   - `AgentProfile` is `graph_id` (required), `llm_profile_id`, `system_prompt_id`, `system_instructions` and `tool_ids`. Stored agents with `default_flow_id` / `optional_elements` read in the new shape.
   - `POST /api/agents/{id}/runs` (`agents.py` `apply_agent`): the profile gives the default provider/model (the request's still wins); the prompt and instructions are prepended to every llm/tool_loop node's system prompt, in a copy of the graph, so the run snapshot records what ran; a non-empty allow-list refuses graphs that call other tools (`AGENT_TOOL_NOT_ALLOWED`, 422).
   - Runs and chat run refs carry `agent_id` (persisted, including SQLite).
   - Studio: the agent form uses pickers (graph, LLM profile, system prompt, allowed-tool checkboxes), cards link to "Run"; the Run panel's "Run as" (and `?agent=`) runs as an agent; chat takes `/run @<agent id or "name"> …`.
   - e2e: `e2e/specs/agents.spec.ts`.
7. **Datasets page:** browse, rename and delete, with "Open in routing lab".

Slices 1 and 2 have no design dependencies and can start immediately. Slice 6's decision was "make agents real".
