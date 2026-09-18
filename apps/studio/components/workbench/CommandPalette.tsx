"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { studioNavGroups } from "@/components/studio/studio-nav";
import { isEditableKeyboardTarget } from "@/lib/graphAuthoring";
import { useWorkbench } from "./WorkbenchProvider";
import { WORKBENCH_PANELS, matchesHotkey, type WorkbenchPanelId } from "./panels";

// Studio-consolidation Phase 8 part B — the discoverability layer for the
// workbench: every route and every app-wide panel (part A) is one Cmd/Ctrl+K
// away, on every page, not just wherever a button for it happens to live.
export function CommandPalette() {
  const [open, setOpen] = useState(false);
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

  const goToRoute = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const openPanel = (id: WorkbenchPanelId) => {
    setOpen(false);
    workbench.open(id);
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
      </CommandList>
    </CommandDialog>
  );
}
