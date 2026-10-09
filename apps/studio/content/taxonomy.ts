import { NODE_TYPES, type EdgeKind, type NodeType } from "@bstockwelldev/agent-graph-sdk";
import { articleLead, edgeArticleId, getArticle, nodeArticleId, type KbArticle } from "@/lib/kb";

// Node and edge help comes from the knowledge base (content/kb/,
// canvas-workbench-ergonomics-plan.md §11): title and summary from the
// article's frontmatter, details from its opening paragraph. A missing
// article fails here at load, and lib/kb.test.ts checks coverage too.

type TaxonomyEntry = { title: string; summary: string; details: string; articleId: string };

function entry(articleId: string, title?: (article: KbArticle) => string): TaxonomyEntry {
  const article = getArticle(articleId);
  if (!article) throw new Error(`knowledge base article "${articleId}" is missing (content/kb/${articleId}.md)`);
  return { title: title ? title(article) : article.title, summary: article.summary, details: articleLead(article), articleId };
}

export const NODE_TYPE_TAXONOMY = Object.fromEntries(NODE_TYPES.map((type) => [type, entry(nodeArticleId(type))])) as Record<NodeType, TaxonomyEntry>;

const EDGE_KINDS: EdgeKind[] = ["sequence", "conditional", "default"];
/** Titles are the edge-kind labels the UI uses ("Always", "Match text", "Fallback"). */
export const EDGE_KIND_TAXONOMY = Object.fromEntries(
  EDGE_KINDS.map((kind) => [kind, entry(edgeArticleId(kind), (article) => article.title.replace(/ edge$/, ""))]),
) as Record<EdgeKind, TaxonomyEntry>;

export const ROUTER_RULES_TAXONOMY = entry("routing", () => "Router rules");

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
    details: "Lists models from the local Ollama daemon. No cloud API key. Local development only: hidden on deployments (e.g. Vercel) that cannot reach it.",
  },
  openai_compat: {
    title: "OpenAI-compatible HTTP",
    summary: "Custom base URL",
    details: "Talks to any OpenAI-compatible chat endpoint. API key may be required depending on server config.",
  },
};
