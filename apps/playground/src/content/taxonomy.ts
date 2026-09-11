import type { NodeType } from "../types";

export const NODE_TYPE_TAXONOMY: Record<
  NodeType,
  { title: string; summary: string; details: string }
> = {
  input: {
    title: "Input node",
    summary: "Accept user input at run time",
    details:
      "Defines a run variable (default: question) that the Run panel supplies. Every graph needs at least one input node as the entry point.",
  },
  prompt: {
    title: "Prompt node",
    summary: "Render a text template from graph state",
    details:
      "Fills placeholders such as {question} and {upstream}. Output is passed to the next node along Always (sequence) edges.",
  },
  llm: {
    title: "LLM node",
    summary: "Call a chat model",
    details:
      "Node default provider/model. The Execute panel overrides all LLM nodes when you Compile or Run.",
  },
  tool: {
    title: "Tool node",
    summary: "Local keyword lookup",
    details:
      "Local keyword lookup (lookup_topic). Does not call the web. Matches the input variable against an in-process table (index, cache, api, …).",
  },
  router: {
    title: "Router node",
    summary: "Choose exactly one outgoing edge",
    details:
      "One Fallback (default) edge plus one or more Match-text (conditional) edges on upstream LLM output. Cycles are not supported; this playground is acyclic only.",
  },
  output: {
    title: "Output node",
    summary: "Return the final run result",
    details: "Whatever value reaches this node becomes the run result shown in the Run panel.",
  },
};

export const EDGE_KIND_TAXONOMY = {
  sequence: {
    title: "Always",
    summary: "Always follow this path",
    details: "Unconditional flow (schema: sequence). Used for linear Prompt → LLM chains.",
  },
  conditional: {
    title: "Match text",
    summary: "Match upstream LLM text",
    details:
      "Router compares the condition as a substring of the previous LLM output (not the Prompt template). First match wins.",
  },
  default: {
    title: "Fallback",
    summary: "Router fallback",
    details: "Taken when no Match-text edge matches. Each router must have exactly one Fallback outgoing edge.",
  },
} as const;

export const ROUTER_RULES_TAXONOMY = {
  title: "Router rules",
  summary: "How routing chooses an edge",
  details:
    "Mark outgoing edges as Fallback (default) or Match text (conditional, substring of upstream LLM output). The compiler requires exactly one Fallback. This playground does not support loops (acyclic graphs only).",
};

export const PROVIDER_TAXONOMY: Record<string, { title: string; summary: string; details: string }> = {
  stub: {
    title: "Stub provider",
    summary: "Offline keyword classifier",
    details: "No API key required. Returns canned answers for demo graphs without network access.",
  },
  groq: {
    title: "Groq",
    summary: "Hosted fast inference",
    details: "Requires GROQ_API_KEY on the server or a per-run override in the API key field.",
  },
  google: {
    title: "Google Gemini",
    summary: "Google generative API",
    details: "Requires GOOGLE_API_KEY on the server or a per-run override.",
  },
  azure: {
    title: "Azure OpenAI",
    summary: "Enterprise OpenAI deployment",
    details: "Requires Azure endpoint and key env vars on the server, or a per-run API key override.",
  },
  ollama: {
    title: "Ollama",
    summary: "Local models",
    details: "Lists models from the local Ollama daemon. No cloud API key; server must reach Ollama.",
  },
  openai_compat: {
    title: "OpenAI-compatible HTTP",
    summary: "Custom base URL",
    details: "Talks to any OpenAI-compatible chat endpoint. API key may be required depending on server config.",
  },
};
