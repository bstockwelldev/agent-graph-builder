# Model resolution

Which provider and model an LLM node runs on, and where each is set. This is the reference; the
reasoning and plan are in [planning/features/model-selection-clarity-plan.md](planning/features/model-selection-clarity-plan.md).
Keep it in step with `backend/app/provider_defaults.py` (`resolve_requested_model`) and the SDK's
`effectiveModelFor`, which share `packages/agent-graph-sdk/contract/model-resolution.json`.

## Vocabulary

- **Run on** (provider): the execution environment for a run: Stub, Ollama, Groq, Google, Azure,
  OpenAI-compatible. It is chosen per run in the Run panel. The code calls it the run's "env".
- **Model**: which model to use *within* that provider.

## `llm` and `tool_loop` nodes

| | Provider | Model |
|---|---|---|
| Decided by | The **run's** provider only. A node's saved `config.provider` is ignored. | First of: run model, bound LLM profile's model, the node's own `model` (a "pin"). |
| Placeholder | n/a | `qwen2.5:3b` and `stub` are not real pins; they resolve to the provider's default model. |
| If none | Run panel default (Stub) | The provider's default model (`PROVIDER_DEFAULT_MODELS`, or `AI_MODEL` override). |

Notes:

- The run model is sent only for providers with a model catalog (and `openai_compat`); other
  providers run on their default model.
- A bound profile's `model_provider` is **not** used on nodes. It only sets the default provider for
  an **agent** run, and an explicit run choice still wins.
- The Run panel's choice is a run-only override. It is never written into the graph.
- Node cards show the result: `stub · default model`, `groq · llama-3.3-70b (run)`,
  `groq · pin-m (pinned)`, `stub · profile Fast`.

## What a run records

Each `llm` / `tool_loop` node's trace input carries:

- `provider`, `model`: what the provider reported actually using.
- `requestedModel`: the model the node asked for, or `null` when the provider's default applied.
- `modelSource`: `run`, `profile`, `pin`, `default`, or `override` (a counterfactual replay supplied its own
  chat model). Traces recorded before this was added lack the last two fields.

The node's Run tab shows it as "Ran on groq · llama-3.3-70b: set in the Run panel".

## Compile warning: `PROFILE_PROVIDER_IGNORED`

A node bound to an LLM profile that sets `model_provider` gets a non-blocking warning on its profile field:
nodes run on the run's provider and take only the profile's model. (Agent runs do use the profile's provider.)

## Other places a model is chosen

| Place | Rule |
|---|---|
| `decision` / `extract` nodes | Their **own** provider (default `stub`); the Run panel's provider does not apply. |
| Chat session | Provider and model fixed when the session is created; chat has no API-key field, so only providers the deployment can serve are offered. A `/run` from chat sends the session's selection as the run override. |
| Eval | Takes provider/model parameters; default `stub`. |
| Replay (counterfactual) | Per-node `model_overrides`. |
| Simulate | Always `stub`. |

## Public demo mode

With `PUBLIC_DEMO_MODE`, only Stub runs without a caller-supplied key. Live providers return 403 until
the visitor pastes their own key in the Run panel (chat sessions cannot take a key).
