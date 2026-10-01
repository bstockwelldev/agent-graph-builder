"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isEditableKeyboardTarget } from "@/lib/graphAuthoring";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { client } from "@/lib/api-client";
import { STUDIO_BUILD_SHA, describeBuild } from "@/lib/buildInfo";
import { GenuiMarkdown } from "@/components/graph/ui/genui/GenuiMarkdown";
import { getArticle, searchArticles, type KbCategory } from "@/lib/kb";
import { useWorkbench } from "./WorkbenchProvider";
import { WORKBENCH_PANELS, type WorkbenchPanelId } from "./panels";

/**
 * The Help panel (canvas-workbench-ergonomics-plan.md §11): searchable
 * knowledge-base articles (content/kb/, lib/kb.ts) and the shortcuts and
 * gestures reference. Opens on "?" -- a deliberate exception to this app's
 * "mod+shift+<key>" convention, since bare "?" is the near-universal help
 * key and `matchesHotkey`'s shift check doesn't fit a symbol that needs
 * Shift to type, so this panel keeps its own listener -- and from the
 * command palette, "Learn more" links and issue messages, which pass
 * `{ articleId }` to open straight on an article.
 */
const PANEL_ID: WorkbenchPanelId = "help";

type HelpTab = "articles" | "shortcuts";

const CATEGORY_LABEL: Record<KbCategory, string> = {
  concept: "Guides",
  node: "Nodes",
  edge: "Edges",
  resource: "Resources",
  panel: "Panels",
};

export function HelpOverlay() {
  const workbench = useWorkbench();
  const open = workbench.activePanel === PANEL_ID;
  const dialogRef = useRef<HTMLDivElement>(null);
  // Wave 3: modal -- trap focus, restore it to the opener on close.
  useFocusTrap(dialogRef, open);
  const requestedArticle = open ? ((workbench.panelContext as { articleId?: string } | null)?.articleId ?? null) : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        workbench.toggle(PANEL_ID);
      }
      // Escape is handled by WorkbenchProvider for every panel (Wave 3).
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, workbench]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close help"
        onClick={() => workbench.close()}
        tabIndex={-1}
        className="animate-in fade-in-0 fixed inset-0 z-40 bg-black/40 duration-200"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        data-workbench-drawer=""
        className="animate-in fade-in-0 zoom-in-95 duration-200 glass-panel ghost-border fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border p-6"
      >
        {/* Keyed by the requested article so each "Learn more" opens fresh on it. */}
        <HelpContent key={requestedArticle ?? "home"} initialArticleId={requestedArticle} onClose={() => workbench.close()} />
      </div>
    </>
  );
}

function HelpContent({ initialArticleId, onClose }: { initialArticleId: string | null; onClose: () => void }) {
  const [tab, setTab] = useState<HelpTab>("articles");
  const [query, setQuery] = useState("");
  const [articleId, setArticleId] = useState<string | null>(initialArticleId && getArticle(initialArticleId) ? initialArticleId : null);
  const article = articleId ? getArticle(articleId) : undefined;
  const results = useMemo(() => searchArticles(query), [query]);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Opening an article moves focus to its title; going back returns it to search.
  const openArticle = (id: string) => {
    setArticleId(id);
    requestAnimationFrame(() => headingRef.current?.focus());
  };
  const back = () => {
    setArticleId(null);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Help</h2>
        <div role="tablist" aria-label="Help sections" className="ml-auto flex gap-1">
          {(["articles", "shortcuts"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-md px-2.5 py-1 text-sm ${tab === id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"}`}
            >
              {id === "articles" ? "Articles" : "Shortcuts"}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "shortcuts" ? (
          <Shortcuts />
        ) : article ? (
          <article aria-labelledby="help-article-title">
            <button type="button" onClick={back} className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm">
              <ArrowLeft className="size-3.5" aria-hidden="true" /> All articles
            </button>
            <h3 id="help-article-title" ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none">
              {article.title}
            </h3>
            <p className="text-muted-foreground mb-3 text-sm">{article.summary}</p>
            <GenuiMarkdown content={article.body} onKbLink={openArticle} />
            {article.related.length > 0 && (
              <div className="mt-5 border-t pt-3">
                <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Related</h4>
                <ul className="flex flex-wrap gap-2">
                  {article.related.map((id) => {
                    const related = getArticle(id);
                    return related ? (
                      <li key={id}>
                        <button type="button" onClick={() => openArticle(id)} className="bg-muted hover:bg-muted/70 rounded-md px-2 py-1 text-sm">
                          {related.title}
                        </button>
                      </li>
                    ) : null;
                  })}
                </ul>
              </div>
            )}
          </article>
        ) : (
          <>
            <label className="relative mb-3 block">
              <span className="sr-only">Search help</span>
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search help: transforms, releases, router…"
                className="bg-background w-full rounded-md border py-1.5 pr-2 pl-8 text-sm"
              />
            </label>
            {results.length === 0 ? (
              <p role="status" className="text-muted-foreground text-sm">
                No articles match “{query}”.
              </p>
            ) : (
              <ul aria-label="Help articles" className="space-y-1">
                {results.map((result) => (
                  <li key={result.id}>
                    <button type="button" onClick={() => openArticle(result.id)} className="hover:bg-muted w-full rounded-md px-2 py-1.5 text-left">
                      <span className="block text-sm font-medium">{result.title}</span>
                      <span className="text-muted-foreground block text-xs">
                        {CATEGORY_LABEL[result.category]} · {result.summary}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <BuildInfo />
    </>
  );
}

function Shortcuts() {
  const globalPanelHotkeys = (
    Object.entries(WORKBENCH_PANELS) as [WorkbenchPanelId, (typeof WORKBENCH_PANELS)[WorkbenchPanelId]][]
  ).filter(([, meta]) => meta.scope === "global" && meta.hotkey);
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <HelpSection title="Canvas navigation">
        <HelpRow keys="Drag / swipe" description="Pan the canvas" />
        <HelpRow keys="Scroll / pinch" description="Zoom in or out" />
        <HelpRow keys="Click / tap" description="Select a node or edge to inspect it" />
        <HelpRow keys="Double-click / double-tap" description="Zoom in on that node" />
        <HelpRow keys="Drag from a handle" description="Connect two nodes" />
        <HelpRow keys="Shift + drag connect" description="Force the edge-kind picker (conditional/default) on any node" />
        <HelpRow keys="Right-click / tap and hold" description="Node, edge, or empty-canvas quick actions" />
      </HelpSection>

      <HelpSection title="Editing">
        <HelpRow keys="Delete / Backspace" description="Remove the selected node or edge" />
        <HelpRow keys="Ctrl/Cmd + Z" description="Undo" />
        <HelpRow keys="Ctrl/Cmd + Shift + Z" description="Redo" />
        <HelpRow keys="Ctrl/Cmd + S" description="Save (in Code view: review, then save)" />
      </HelpSection>

      <HelpSection title="Workbench panels">
        {globalPanelHotkeys.map(([id, meta]) => (
          <HelpRow key={id} keys={formatHotkey(meta.hotkey!)} description={meta.title} />
        ))}
        <HelpRow keys="Ctrl/Cmd + K" description="Command palette — jump to any route, panel or help article" />
        <HelpRow keys="?" description="Toggle help" />
        <HelpRow
          keys="Switch graph / Add node / Run"
          description="Graph-only panels — open from the HUD buttons above the canvas, or the bottom bar on narrow screens"
        />
      </HelpSection>

      <HelpSection title="Everywhere">
        <HelpRow keys="Escape" description="Close the open menu, dialog, or panel" />
      </HelpSection>
    </div>
  );
}

/** Which commit the studio and API run, so a stale deploy is visible. */
function BuildInfo() {
  // undefined while loading, null when the API doesn't know its commit.
  const [apiCommit, setApiCommit] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    client.system.health().then(
      (health) => !cancelled && setApiCommit(health.commit ?? null),
      () => !cancelled && setApiCommit(null),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const build = describeBuild(STUDIO_BUILD_SHA, apiCommit);
  return (
    <p className="text-muted-foreground mt-6 border-t pt-3 font-mono text-xs" aria-label="Build">
      {build.text}
      {build.mismatch ? <span className="text-destructive ml-2 font-sans">The studio and API are on different commits.</span> : null}
    </p>
  );
}

function HelpSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function HelpRow({ keys, description }: { keys: string; description: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <dt className="bg-muted w-fit rounded px-1.5 py-0.5 font-mono text-xs">{keys}</dt>
      <dd className="text-muted-foreground">{description}</dd>
    </div>
  );
}

function formatHotkey(hotkey: string): string {
  return hotkey
    .split("+")
    .map((part) => (part === "mod" ? "Ctrl/Cmd" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" + ");
}
