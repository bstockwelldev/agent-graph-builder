// Knowledge base bundle (canvas-workbench-ergonomics-plan.md §11).
// Articles are Markdown with YAML frontmatter in apps/studio/content/kb/.
// This writes one JSON bundle for the studio (content/kb.generated.json)
// and the same bundle for the API (backend/app/kb_articles.json), which
// deploys on its own and can't read the studio's files. `--check` fails
// when either bundle is out of date; lib/kb.test.ts runs the same check.
//
//   pnpm kb            # rebuild both bundles
//   pnpm kb --check    # verify them (CI runs this through the studio tests)

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
export const KB_DIR = resolve(here, "../content/kb");
export const BUNDLE_PATHS = [resolve(here, "../content/kb.generated.json"), resolve(here, "../../../backend/app/kb_articles.json")];

const CATEGORIES = new Set(["concept", "node", "edge", "panel", "resource"]);
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function parseArticle(file, source) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, "\n"));
  if (!match) throw new Error(`${file}: missing frontmatter`);
  const meta = parseYaml(match[1]) ?? {};
  const article = {
    id: meta.id,
    title: meta.title,
    summary: meta.summary,
    category: meta.category,
    keywords: meta.keywords ?? [],
    related: meta.related ?? [],
    body: match[2].trim(),
  };
  if (!ID.test(String(article.id))) throw new Error(`${file}: id must be kebab-case`);
  if (`${article.id}.md` !== file) throw new Error(`${file}: file name must be ${article.id}.md`);
  for (const key of ["title", "summary", "body"]) {
    if (typeof article[key] !== "string" || !article[key].trim()) throw new Error(`${file}: ${key} is required`);
  }
  if (!CATEGORIES.has(article.category)) throw new Error(`${file}: category must be one of ${[...CATEGORIES].join(", ")}`);
  for (const key of ["keywords", "related"]) {
    if (!Array.isArray(article[key]) || article[key].some((value) => typeof value !== "string")) throw new Error(`${file}: ${key} must be a list of strings`);
  }
  return article;
}

/** Every article, sorted by id, with links checked. */
export function buildKnowledgeBase(dir = KB_DIR) {
  const articles = readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => parseArticle(file, readFileSync(join(dir, file), "utf8")));
  const ids = new Set(articles.map((article) => article.id));
  for (const article of articles) {
    for (const related of article.related) {
      if (!ids.has(related)) throw new Error(`${article.id}: related "${related}" is not an article`);
    }
    for (const [, target] of article.body.matchAll(/\]\(kb:([^)]+)\)/g)) {
      if (!ids.has(target)) throw new Error(`${article.id}: link to "${target}" is not an article`);
    }
  }
  return { version: 1, articles };
}

export function serializeKnowledgeBase(kb) {
  return `${JSON.stringify(kb, null, 2)}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = serializeKnowledgeBase(buildKnowledgeBase());
  if (process.argv.includes("--check")) {
    const stale = BUNDLE_PATHS.filter((path) => {
      try {
        return readFileSync(path, "utf8") !== text;
      } catch {
        return true;
      }
    });
    if (stale.length) {
      console.error(`Knowledge base bundle out of date: ${stale.join(", ")}. Run \`pnpm kb\`.`);
      process.exit(1);
    }
  } else {
    for (const path of BUNDLE_PATHS) writeFileSync(path, text);
    console.log(`Wrote ${BUNDLE_PATHS.length} knowledge base bundles.`);
  }
}
