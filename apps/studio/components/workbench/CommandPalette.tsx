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
} from "@/components/ui/command";
import { studioNavGroups } from "@/components/studio/studio-nav";
import { client } from "@/lib/api-client";
import { isEditableKeyboardTarget } from "@/lib/graphAuthoring";
import { useWorkbench } from "./WorkbenchProvider";
import { WORKBENCH_PANELS, matchesHotkey, type WorkbenchPanelId } from "./panels";

// Studio-consolidation Phase 8 part B — the discoverability layer for the
// workbench: every route and every app-wide panel (part A) is one Cmd/Ctrl+K
// away, on every page, not just wherever a button for it happens to live.
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [recentSessions, setRecentSessions] = useState<ChatSession[]>([]);
  const router = useRouter();
  const workbench = useWorkbench();

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

  const openChatSession = (sessionId: string) => {
    setOpen(false);
    workbench.open("chat", { chatSessionId: sessionId });
  };

  const globalPanels = (Object.entries(WORKBENCH_PANELS) as [WorkbenchPanelId, (typeof WORKBENCH_PANELS)[WorkbenchPanelId]][]).filter(
    ([, meta]) => meta.scope === "global",
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to a page or open a panel…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
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
          {globalPanels.map(([id, meta]) => (
            <CommandItem key={id} value={meta.title} onSelect={() => openPanel(id)}>
              {meta.title}
            </CommandItem>
          ))}
        </CommandGroup>
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
