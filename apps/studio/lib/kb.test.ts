import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NODE_TYPES } from "@bstockwelldev/agent-graph-sdk";

import { BUNDLE_PATHS, buildKnowledgeBase, serializeKnowledgeBase } from "../scripts/kb-build.mjs";
import { WORKBENCH_PANELS, type WorkbenchPanelId } from "@/components/workbench/panels";
import { RESOURCE_KINDS } from "@/components/studio/resource-kinds";
import { EDGE_KIND_TAXONOMY, NODE_TYPE_TAXONOMY } from "@/content/taxonomy";
import { DIAGNOSTIC_ARTICLE, KB_ARTICLES, PANEL_ARTICLE, articleLead, edgeArticleId, getArticle, nodeArticleId, searchArticles } from "./kb";

// canvas-workbench-ergonomics-plan.md §11: like the SDK's route-handler
// coverage test, a new node type, edge kind, panel or resource kind fails
// here until it has an article.
describe("knowledge base", () => {
  it("bundles are up to date with content/kb (run `pnpm kb`)", () => {
    const expected = serializeKnowledgeBase(buildKnowledgeBase());
    for (const path of BUNDLE_PATHS) expect(readFileSync(path, "utf8"), path).toBe(expected);
  });

  it("covers every node type, edge kind, panel, resource kind and diagnostic category", () => {
    const missing = [
      ...NODE_TYPES.map(nodeArticleId),
      ...(["sequence", "conditional", "default"] as const).map(edgeArticleId),
      ...(Object.keys(WORKBENCH_PANELS) as WorkbenchPanelId[]).map((panel) => PANEL_ARTICLE[panel]),
      ...RESOURCE_KINDS.map((kind) => PANEL_ARTICLE[kind.panelId]),
      ...Object.values(DIAGNOSTIC_ARTICLE),
    ].filter((id) => !getArticle(id));
    expect(missing).toEqual([]);
    for (const type of NODE_TYPES) expect(getArticle(nodeArticleId(type))?.category).toBe("node");
  });

  it("derives tooltips from the articles", () => {
    const transform = getArticle("node-transform")!;
    expect(NODE_TYPE_TAXONOMY.transform).toMatchObject({ title: transform.title, summary: transform.summary, details: articleLead(transform) });
    expect(EDGE_KIND_TAXONOMY.default.title).toBe("Fallback");
    expect(articleLead(getArticle("transforms")!)).not.toMatch(/[*`]/);
  });

  it("searches titles, keywords, summaries and bodies, every word required", () => {
    expect(searchArticles("transform").slice(0, 2).map((article) => article.id).sort()).toEqual(["node-transform", "transforms"]);
    expect(searchArticles("json pointer")[0].id).toBe("transforms");
    expect(searchArticles("contract warning")[0].id).toBe("ports-and-contracts");
    expect(searchArticles("zzz-no-such-thing")).toEqual([]);
    expect(searchArticles("")).toHaveLength(KB_ARTICLES.length);
    expect(searchArticles("")[0].category).toBe("concept");
  });
});
