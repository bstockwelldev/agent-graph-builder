import type { EdgeKind, NodeType } from "@bstockwelldev/agent-graph-sdk";
import type { WorkbenchPanelId } from "@/components/workbench/panels";
import bundle from "@/content/kb.generated.json";

// The in-app knowledge base (canvas-workbench-ergonomics-plan.md §11): one
// short article per concept, node type, edge kind, panel and resource kind,
// written as Markdown in content/kb/ and bundled by scripts/kb-build.mjs
// (`pnpm kb`). Tooltips, "Learn more", the Help panel, the command palette
// and Chat all read these, so they can't disagree.

export type KbCategory = "concept" | "node" | "edge" | "panel" | "resource";
export type KbArticle = {
  id: string;
  title: string;
  summary: string;
  category: KbCategory;
  keywords: string[];
  related: string[];
  body: string;
};

export const KB_ARTICLES = bundle.articles as KbArticle[];

const BY_ID = new Map(KB_ARTICLES.map((article) => [article.id, article]));

export function getArticle(id: string): KbArticle | undefined {
  return BY_ID.get(id);
}

export const nodeArticleId = (type: NodeType) => `node-${type.replace(/_/g, "-")}`;
export const edgeArticleId = (kind: EdgeKind) => `edge-${kind}`;

/** The article each workbench panel's "What's this?" opens (resource panels share their resource's article). */
export const PANEL_ARTICLE: Record<WorkbenchPanelId, string> = {
  palette: "canvas-basics",
  run: "runs-and-traces",
  releases: "releases",
  routingLab: "routing-lab",
  knowledge: "knowledge-base-rag",
  policies: "policies",
  health: "graph-health",
  graphConfig: "code-mode",
  notes: "sticky-notes",
  chat: "chat",
  agents: "agents",
  prompts: "resource-prompts",
  tools: "resource-tools",
  mcp: "mcp-servers",
  llmProfiles: "resource-llm-profiles",
  transforms: "transforms",
  datasets: "datasets",
  analytics: "analytics",
  console: "console",
  help: "help",
};

/** Diagnostic categories (Diagnostic.category) and the article that explains them. */
export const DIAGNOSTIC_ARTICLE: Record<string, string> = {
  structure: "validation",
  contract: "ports-and-contracts",
  policy: "policies",
  capability: "validation",
};

/** Plain text of a Markdown snippet: links keep their label, emphasis and code marks go. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The article's opening paragraph as plain text: the tooltip-length explanation. */
export function articleLead(article: KbArticle): string {
  return plainText(article.body.split(/\n\s*\n/)[0] ?? "");
}

/**
 * Articles matching every word of `query`, best first: a title hit outranks
 * a keyword, which outranks the summary, then the body. Empty query: all
 * articles, concepts first, then by title.
 */
export function searchArticles(query: string, articles: KbArticle[] = KB_ARTICLES): KbArticle[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    const order: KbCategory[] = ["concept", "node", "edge", "resource", "panel"];
    return [...articles].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.title.localeCompare(b.title));
  }
  const scored: { article: KbArticle; score: number }[] = [];
  for (const article of articles) {
    const title = article.title.toLowerCase();
    const keywords = article.keywords.map((keyword) => keyword.toLowerCase());
    const summary = article.summary.toLowerCase();
    const body = article.body.toLowerCase();
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      const termScore =
        (title.includes(term) ? 10 : 0) +
        (keywords.some((keyword) => keyword === term) ? 8 : keywords.some((keyword) => keyword.includes(term)) ? 5 : 0) +
        (summary.includes(term) ? 3 : 0) +
        (body.includes(term) ? 1 : 0);
      if (termScore === 0) matchedAll = false;
      score += termScore;
    }
    if (matchedAll) scored.push({ article, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title)).map((entry) => entry.article);
}
