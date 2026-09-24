"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import type { ChatContext, ChatMessage, ChatRunRef, ChatSession, GraphSummary } from "@bstockwelldev/agent-graph-sdk";
import type { ChatProvider } from "@bstockwelldev/agent-graph-sdk";
import { client } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderModelPicker } from "@/components/graph/ProviderModelPicker";
import { Conversation, ConversationContent, ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { RunCard, RunConfirmCard, versionLabel } from "@/components/ai-elements/run-card";
import { useWorkbench } from "@/components/workbench/WorkbenchProvider";
import { matchRunIntent, needsConfirmation, parseRunCommand, type RunTarget } from "@/lib/chatRuns";
import { ChatRunPicker } from "./ChatRunPicker";

/** A run waiting on the user's Confirm (release runs, free-text proposals). */
type PendingRun = { target: RunTarget; command: string; reason: string };

function commandFor(target: RunTarget): string {
  const selector = target.release === null ? "" : target.release === "latest" ? "@latest" : `@${target.release}`;
  const args = Object.entries(target.input)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => (/\s/.test(value) ? `${key}="${value}"` : `${key}=${value}`))
    .join(" ");
  return `/run ${target.graph.id}${selector}${args ? ` ${args}` : ""}`;
}

/**
 * Direct model scratchpad (studio-consolidation Phase 8 part E) — chats
 * straight to a chosen provider/model via `client.chatSessions.send`,
 * bypassing the graph engine entirely (confirmed with the user: not bound
 * to a node, not a multi-turn graph execution). Session persistence is a
 * day-one requirement (also confirmed), so sessions are listed/created via
 * the same `chatSessions` resource client every other resource kind uses.
 */
export function ChatPanel() {
  const workbench = useWorkbench();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newProvider, setNewProvider] = useState<ChatProvider>("stub");
  const [newModel, setNewModel] = useState("stub");

  // Chat context binding (studio-ux-gap-remediation-plan.md §3, STO-596).
  // On by default; the user can opt out per-panel-session via the strip
  // below. Hidden entirely when no graph is open (workbench.graphContext
  // is null, e.g. on /agents).
  const [includeContext, setIncludeContext] = useState(true);
  const graphContext = workbench.graphContext;
  const router = useRouter();

  // Graph runs from Chat (studio-ux-gap-remediation-plan.md §4, STO-600).
  const [graphs, setGraphs] = useState<GraphSummary[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);
  const [startingRun, setStartingRun] = useState(false);

  async function loadGraphs(): Promise<GraphSummary[]> {
    if (graphs) return graphs;
    const list = await client.graphs.summaries.list();
    setGraphs(list);
    return list;
  }

  useEffect(() => {
    let cancelled = false;
    setSessionsLoading(true);
    client
      .chatSessions.list()
      .then((list) => {
        if (!cancelled) setSessions(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Preselects the session the command palette's "recent sessions" group
  // was opened with (studio-consolidation Phase 8 part E).
  useEffect(() => {
    const context = workbench.panelContext as { chatSessionId?: string } | null;
    if (context?.chatSessionId) void openSession(context.chatSessionId);
  }, [workbench.panelContext]);

  async function openSession(id: string) {
    setError(null);
    try {
      const session = await client.chatSessions.get(id);
      setActiveSession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function createSession() {
    setError(null);
    const id = `chat_${crypto.randomUUID().slice(0, 8)}`;
    const session: ChatSession = {
      id,
      title: `Scratchpad ${new Date().toLocaleString()}`,
      provider: newProvider,
      model: newModel,
      messages: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      const created = await client.chatSessions.create(session);
      setSessions((prev) => [...prev, created]);
      setActiveSession(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function appendMessages(session: ChatSession, messages: ChatMessage[]): Promise<ChatSession> {
    const updated = await client.chatSessions.update({
      ...session,
      messages: [...session.messages, ...messages],
      updated_at: new Date().toISOString(),
    });
    setActiveSession(updated);
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    return updated;
  }

  /** Starts the run through the same run API the Run panel uses, then
   * records it in the session as a run card. */
  async function executeRun(target: RunTarget, command: string) {
    if (!activeSession) return;
    setStartingRun(true);
    setError(null);
    try {
      let releaseId: string | null = null;
      if (target.release !== null) {
        const releases = [...(await client.releases.list(target.graph.id))].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        const release = target.release === "latest" ? releases[0] : releases.find((entry) => entry.release_id === target.release);
        if (!release) {
          throw new Error(
            target.release === "latest"
              ? `${target.graph.name} has no published releases yet.`
              : `${target.graph.name} has no release ${target.release}.`,
          );
        }
        releaseId = release.release_id;
      }
      const provider = activeSession.provider as ChatProvider;
      const model = activeSession.model || undefined;
      const { run: summary } = releaseId
        ? await client.releases.run(releaseId, { input: target.input, provider, model })
        : await client.runs.start({ graphId: target.graph.id, input: target.input, provider, model });
      const run: ChatRunRef = {
        run_id: summary.run_id,
        graph_id: target.graph.id,
        graph_name: target.graph.name,
        source: releaseId ? "release" : "draft",
        release_id: releaseId,
        input: target.input,
      };
      const now = new Date().toISOString();
      await appendMessages(activeSession, [
        { role: "user", content: command, created_at: now },
        { role: "assistant", content: `Started ${run.graph_name} (${versionLabel(run)}) as ${run.run_id}.`, created_at: now, run },
      ]);
      setPendingRun(null);
      setPickerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStartingRun(false);
    }
  }

  function requestRun(target: RunTarget, command: string) {
    if (needsConfirmation(target)) {
      setPendingRun({
        target,
        command,
        reason:
          target.release !== null
            ? "This runs a published release, so it needs your confirmation first."
            : "Proposed from your message — confirm to run the saved draft.",
      });
      setPickerOpen(false);
      return;
    }
    void executeRun(target, command);
  }

  const viewRun = (run: ChatRunRef) => {
    if (graphContext && graphContext.graphId === run.graph_id && graphContext.inspectRun) {
      graphContext.inspectRun(run.run_id);
      workbench.open("run");
    } else {
      router.push(`/graphs/${encodeURIComponent(run.graph_id)}?run=${encodeURIComponent(run.run_id)}&panel=run`);
    }
  };

  const viewFlow = (run: ChatRunRef) => {
    if (graphContext && graphContext.graphId === run.graph_id) workbench.close();
    else router.push(`/graphs/${encodeURIComponent(run.graph_id)}`);
  };

  async function sendMessage(content: string) {
    if (!activeSession) return;
    // `/run …` and "run <graph>" start graph runs instead of messaging the model.
    if (/^\/run\b/i.test(content) || /^(?:please\s+|can you\s+|could you\s+)?(?:run|execute|start)\s/i.test(content)) {
      try {
        const list = await loadGraphs();
        const command = parseRunCommand(content, list);
        if (command) {
          if (command.ok) requestRun(command.target, content);
          else setError(command.error);
          return;
        }
        const intent = matchRunIntent(content, list);
        if (intent) {
          requestRun(intent, content);
          return;
        }
      } catch (err) {
        // A plain "run …" sentence still goes to the model if graphs can't load.
        if (/^\/run\b/i.test(content)) {
          setError(err instanceof Error ? err.message : String(err));
          return;
        }
      }
    }
    setSending(true);
    setError(null);
    try {
      const context: ChatContext | undefined =
        includeContext && graphContext
          ? {
              graph: graphContext.getGraph(),
              graph_id: graphContext.graphId,
              selected_node_id: graphContext.selectedNodeId,
              selected_edge_id: graphContext.selectedEdgeId,
              run_id: graphContext.runId,
            }
          : undefined;
      const updated = await client.chatSessions.send(activeSession.id, { content, context });
      setActiveSession(updated);
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <Select
          value={activeSession?.id ?? ""}
          // Shows the session title, not its id, in the trigger.
          items={Object.fromEntries(sessions.map((session) => [session.id, session.title]))}
          onValueChange={(id) => {
            if (id) void openSession(id);
          }}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={sessionsLoading ? "Loading sessions…" : "Select a session"} />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((session) => (
              <SelectItem key={session.id} value={session.id}>
                {session.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="outline" onClick={() => void createSession()}>
          New session
        </Button>
      </div>

      {!activeSession ? (
        <div className="flex flex-1 flex-col gap-3 p-3">
          <div className="text-muted-foreground text-xs">Pick a provider/model for a new session:</div>
          <ProviderModelPicker
            provider={newProvider}
            model={newModel}
            onProviderChange={setNewProvider}
            onModelChange={setNewModel}
          />
          <ConversationEmptyState
            title="No session open"
            description="Select an existing session above, or create a new one."
          />
        </div>
      ) : (
        <>
          {graphContext && (
            <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
              <span className="text-muted-foreground min-w-0 flex-1 truncate">
                Context: {graphContext.graphName || graphContext.graphId}
                {graphContext.selectedNodeId ? ` · Selected: ${graphContext.selectedNodeId}` : ""}
                {graphContext.runId ? ` · Run: ${graphContext.runId}` : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant={includeContext ? "secondary" : "ghost"}
                className="h-6 shrink-0 px-2 text-xs"
                onClick={() => setIncludeContext((v) => !v)}
                aria-pressed={includeContext}
              >
                {includeContext ? "Context on" : "Context off"}
              </Button>
            </div>
          )}
          <Conversation autoScrollKey={`${activeSession.messages.length}:${pendingRun ? "pending" : ""}`}>
            <ConversationContent>
              {activeSession.messages.length === 0 ? (
                <ConversationEmptyState />
              ) : (
                activeSession.messages.map((message, index) => (
                  <Message key={index} from={message.role}>
                    {message.run ? (
                      <RunCard runRef={message.run} onViewRun={() => viewRun(message.run!)} onViewFlow={() => viewFlow(message.run!)} />
                    ) : (
                      <MessageContent from={message.role}>{message.content}</MessageContent>
                    )}
                  </Message>
                ))
              )}
              {pendingRun && (
                <Message from="assistant">
                  <RunConfirmCard
                    graphName={pendingRun.target.graph.name}
                    version={pendingRun.target.release === null ? "Draft" : pendingRun.target.release === "latest" ? "Latest release" : `Release ${pendingRun.target.release}`}
                    environment={`${activeSession.provider} · ${activeSession.model}`}
                    input={pendingRun.target.input}
                    reason={pendingRun.reason}
                    busy={startingRun}
                    onConfirm={() => void executeRun(pendingRun.target, pendingRun.command)}
                    onCancel={() => setPendingRun(null)}
                  />
                </Message>
              )}
              {(sending || startingRun) && <Shimmer />}
            </ConversationContent>
          </Conversation>
          {error && <div className="text-destructive px-3 py-1 text-xs">{error}</div>}
          {pickerOpen && graphs && (
            <ChatRunPicker
              graphs={graphs}
              defaultGraphId={graphContext?.graphId}
              onSubmit={(target) => requestRun(target, commandFor(target))}
              onCancel={() => setPickerOpen(false)}
            />
          )}
          <PromptInput
            onSubmit={(text) => void sendMessage(text)}
            disabled={sending || startingRun}
            className="border-t"
            placeholder="Message the model, or /run <graph> …"
            actions={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Run a graph"
                aria-expanded={pickerOpen}
                title="Run a graph"
                onClick={() => {
                  if (pickerOpen) {
                    setPickerOpen(false);
                    return;
                  }
                  void loadGraphs()
                    .then(() => setPickerOpen(true))
                    .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
                }}
              >
                <Play className="size-4" />
              </Button>
            }
          />
        </>
      )}
    </div>
  );
}
