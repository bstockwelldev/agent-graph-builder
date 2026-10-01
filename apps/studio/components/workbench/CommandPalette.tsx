"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatSession } from "@bstockwelldev/agent-graph-sdk";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import type { CanvasCommand, CanvasCommandGroup } from "@/components/graph/canvasCommands";
import { studioNavGroups } from "@/components/studio/studio-nav";
import { client } from "@/lib/api-client";
import { KB_ARTICLES } from "@/lib/kb";
import { isEditableKeyboardTarget } from "@/lib/graphAuthoring";
import { useConsoleUnreadCounts } from "@/lib/consoleLog";
import { useWorkbench } from "./WorkbenchProvider";
import { WORKBENCH_PANELS, matchesHotkey, type WorkbenchPanelId } from "./panels";

const CANVAS_GROUPS: CanvasCommandGroup[] = ["Arrange", "Canvas", "View", "Graph"];

// Studio-consolidation Phase 8 part B — the discoverability layer for the
// workbench: every route and every app-wide panel (part A) is one Cmd/Ctrl+K
// away, on every page, not just wherever a button for it happens to live.
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [recentSessions, setRecentSessions] = useState<ChatSession[]>([]);
  const [search, setSearch] = useState("");
  // Canvas actions (align, views, save, ...) from the open graph, read once
  // per opening so they reflect the selection at that moment.
  const [canvasCommands, setCanvasCommands] = useState<CanvasCommand[]>([]);
  const router = useRouter();
  const workbench = useWorkbench();
  // Studio-config-editor-and-console-plan.md §7's "HUD toggle shows a
  // count/severity badge" — this repo's global panels have no persistent
  // icon-button row, so the badge lives on the Console command instead.
  const { errors: unreadErrors, warnings: unreadWarnings } = useConsoleUnreadCounts();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (matchesHotkey(event, "mod+k")) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Fetch the session list each time the palette opens, so "recent
  // sessions" reflects anything created/renamed since it was last open
  // (studio-consolidation Phase 8 part E — this group was deferred out of
  // part B because chat sessions didn't exist yet at that point).
  useEffect(() => {
    if (!open) return;
    setCanvasCommands(workbench.graphContext?.getCanvasCommands?.() ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    client
      .chatSessions.list()
      .then((sessions) => {
        if (!cancelled) setRecentSessions(sessions.slice(-5).reverse());
      })
      .catch(() => {
        if (!cancelled) setRecentSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const goToRoute = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const openPanel = (id: WorkbenchPanelId) => {
    setOpen(false);
    workbench.open(id);
  };

  const runCanvasCommand = (command: CanvasCommand) => {
    setOpen(false);
    setSearch("");
    command.run();
  };

  const openArticle = (articleId: string) => {
    setOpen(false);
    workbench.open("help", { articleId });
  };

  const openChatSession = (sessionId: string) => {
    setOpen(false);
    workbench.open("chat", { chatSessionId: sessionId });
  };

  const globalPanels = (Object.entries(WORKBENCH_PANELS) as [WorkbenchPanelId, (typeof WORKBENCH_PANELS)[WorkbenchPanelId]][]).filter(
    ([, meta]) => meta.scope === "global",
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <CommandInput placeholder="Jump to a page, run a canvas action, or search help…" value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {CANVAS_GROUPS.map((group) => {
          const commands = canvasCommands.filter((command) => command.group === group);
          if (commands.length === 0) return null;
          return (
            <CommandGroup key={group} heading={group}>
              {commands.map((command) => (
                <CommandItem
                  key={command.id}
                  value={`${group}: ${command.label}`}
                  keywords={command.keywords}
                  disabled={Boolean(command.disabledReason)}
                  onSelect={() => runCanvasCommand(command)}
                >
                  <span className="flex-1">
                    {command.label}
                    {command.disabledReason && <span className="text-muted-foreground ml-2 text-xs">{command.disabledReason}</span>}
                  </span>
                  {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
        {studioNavGroups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem key={item.href} value={item.label} onSelect={() => goToRoute(item.href)}>
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandGroup heading="Workbench">
          {globalPanels.map(([id, meta]) => {
            const unreadSuffix =
              id === "console" && (unreadErrors > 0 || unreadWarnings > 0)
                ? ` — ${[unreadErrors > 0 ? `${unreadErrors} error${unreadErrors === 1 ? "" : "s"}` : null, unreadWarnings > 0 ? `${unreadWarnings} warning${unreadWarnings === 1 ? "" : "s"}` : null]
                    .filter(Boolean)
                    .join(", ")}`
                : "";
            return (
              <CommandItem key={id} value={meta.title} onSelect={() => openPanel(id)}>
                {meta.title}
                {unreadSuffix}
              </CommandItem>
            );
          })}
        </CommandGroup>
        {/* Help articles (canvas-workbench-ergonomics-plan.md §11) only once
            there's a query: all of them would bury the pages and panels. */}
        {search.trim() && (
          <CommandGroup heading="Help">
            {KB_ARTICLES.map((article) => (
              <CommandItem key={article.id} value={`Help: ${article.title}`} keywords={article.keywords} onSelect={() => openArticle(article.id)}>
                Help: {article.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {recentSessions.length > 0 && (
          <CommandGroup heading="Recent sessions">
            {recentSessions.map((session) => (
              <CommandItem
                key={session.id}
                value={`session-${session.id}-${session.title}`}
                onSelect={() => openChatSession(session.id)}
              >
                {session.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
