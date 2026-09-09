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
      "Uses Handlebars-style placeholders such as {question} or upstream outputs. Output is passed to the next node along sequence edges.",
  },
  llm: {
    title: "LLM node",
    summary: "Call a chat model",
    details:
      "Runs the configured model with an optional system prompt. Provider and model at run time can override defaults from the Run panel.",
  },
  tool: {
    title: "Tool node",
    summary: "Deterministic lookup or transform",
    details:
      "POC supports lookup_topic only — a keyword table keyed off the input variable. Tools do not call external APIs in v1.",
  },
  router: {
    title: "Router node",
    summary: "Choose exactly one outgoing edge",
    details:
      "Evaluates conditional edges (substring match on upstream LLM output) and falls back to a single default edge. Compiler requires one default and valid conditions.",
  },
  output: {
    title: "Output node",
    summary: "Return the final run result",
    details: "Whatever value reaches this node becomes the run result shown in the Run panel.",
  },
};

export const EDGE_KIND_TAXONOMY = {
  sequence: {
    title: "Sequence edge",
    summary: "Always follow this path",
    details: "Unconditional flow between nodes. Used for linear prompt → LLM chains.",
  },
  conditional: {
    title: "Conditional edge",
    summary: "Match upstream text",
    details:
      "Router compares the condition string as a substring of the upstream LLM output. First match wins; animated on canvas when conditional.",
  },
  default: {
    title: "Default edge",
    summary: "Router fallback",
    details: "Taken when no conditional edge matches. Each router must have exactly one default outgoing edge.",
  },
} as const;

export const ROUTER_RULES_TAXONOMY = {
  title: "Router rules",
  summary: "How routing chooses an edge",
  details:
    "Mark outgoing edges as conditional (with a condition string) or default (fallback). The compiler validates that every router has exactly one default edge and that conditions are non-empty.",
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
