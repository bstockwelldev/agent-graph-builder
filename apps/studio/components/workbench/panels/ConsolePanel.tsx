"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  markConsoleViewed,
  requestCanvasFocus,
  useConsoleLog,
  type ConsoleEntry,
  type ConsoleSeverity,
} from "@/lib/consoleLog";

/**
 * App-wide console/log drawer (studio-config-editor-and-console-plan.md
 * §7): a standing, app-wide surface for logs/warnings/errors — including
 * client-side errors that previously only reached the browser devtools
 * console — plus live run events, mirrored from GraphEditor.tsx's SSE
 * handler into the same `lib/consoleLog.ts` store this panel reads.
 *
 * Global scope like Chat/Analytics/the resource browsers, so it renders as
 * a right-side floating panel via the existing `WorkbenchDrawer` — this
 * repo has no bottom-drawer primitive, and building a new one for a single
 * panel isn't proportional; every other "toggleable HUD surface" already
 * uses this exact pattern.
 */
function severityVariant(severity: ConsoleSeverity): "destructive" | "secondary" | "outline" {
  if (severity === "error") return "destructive";
  if (severity === "warning") return "secondary";
  return "outline";
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString();
}

function EntryRow({ entry, onOpen }: { entry: ConsoleEntry; onOpen?: (entry: ConsoleEntry) => void }) {
  const clickable = Boolean(entry.graphId && entry.nodeId);
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onOpen?.(entry) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") onOpen?.(entry);
            }
          : undefined
      }
      className={`flex items-start gap-2 border-b py-2 text-xs last:border-b-0 ${
        clickable ? "cursor-pointer hover:bg-muted/50" : ""
      }`}
    >
      <Badge variant={severityVariant(entry.severity)} className="mt-0.5">
        {entry.severity}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground flex items-center gap-2">
          <span>{formatTimestamp(entry.timestamp)}</span>
          <span>·</span>
          <span>{entry.source}</span>
          {entry.nodeId && (
            <>
              <span>·</span>
              <span className="truncate">{entry.nodeId}</span>
            </>
          )}
        </div>
        <div className="mt-0.5 break-words">{entry.message}</div>
      </div>
    </div>
  );
}

function EntryList({ entries, onOpen, emptyLabel }: { entries: ConsoleEntry[]; onOpen: (entry: ConsoleEntry) => void; emptyLabel: string }) {
  if (entries.length === 0) {
    return <div className="text-muted-foreground p-4 text-xs">{emptyLabel}</div>;
  }
  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        {[...entries].reverse().map((entry) => (
          <EntryRow key={entry.id} entry={entry} onOpen={onOpen} />
        ))}
      </div>
    </ScrollArea>
  );
}

export function ConsolePanel() {
  const entries = useConsoleLog();
  const router = useRouter();
  const [tab, setTab] = useState("logs");

  // Mounts only while the panel is open (WorkbenchDrawer gates rendering
  // on the active panel), so this marks "viewed" each time it's opened —
  // the unread badge (via unreadSeverityCounts) resets from here.
  useEffect(() => {
    markConsoleViewed();
  }, []);

  const warnings = entries.filter((entry) => entry.severity === "warning");
  const errors = entries.filter((entry) => entry.severity === "error");
  const runEvents = entries.filter((entry) => entry.source === "Run");

  function handleOpen(entry: ConsoleEntry) {
    if (!entry.graphId || !entry.nodeId) return;
    requestCanvasFocus(entry.graphId, entry.nodeId);
    router.push(`/graphs/${entry.graphId}`);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col">
        <TabsList className="mx-2 mt-2">
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="warnings">Warnings{warnings.length > 0 ? ` (${warnings.length})` : ""}</TabsTrigger>
          <TabsTrigger value="errors">Errors{errors.length > 0 ? ` (${errors.length})` : ""}</TabsTrigger>
          <TabsTrigger value="run">Run events</TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="min-h-0 flex-1">
          <EntryList entries={entries} onOpen={handleOpen} emptyLabel="No log entries yet." />
        </TabsContent>
        <TabsContent value="warnings" className="min-h-0 flex-1">
          <EntryList entries={warnings} onOpen={handleOpen} emptyLabel="No warnings." />
        </TabsContent>
        <TabsContent value="errors" className="min-h-0 flex-1">
          <EntryList entries={errors} onOpen={handleOpen} emptyLabel="No errors." />
        </TabsContent>
        <TabsContent value="run" className="min-h-0 flex-1">
          <EntryList entries={runEvents} onOpen={handleOpen} emptyLabel="No run events yet — start a run to see live events here." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
