"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Play } from "lucide-react";
import type { ChatContext, ChatMessage, ChatProvider, ChatRunRef, ChatSession, GraphSummary } from "@bstockwelldev/agent-graph-sdk";
import { client } from "@/lib/api-client";
import { Button } from "@/components/graph/ui/Button";
import { Combobox } from "@/components/graph/ui/Combobox";
import { Field } from "@/components/graph/ui/Field";
import { PasswordInput } from "@/components/graph/ui/fields";
import { IconButton } from "@/components/graph/ui/IconButton";
import { ProviderModelPicker } from "@/components/graph/ProviderModelPicker";
import { Conversation, ConversationContent, ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { RunCard, RunConfirmCard, versionLabel } from "@/components/ai-elements/run-card";
import { color, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { useWorkbench } from "@/components/workbench/WorkbenchProvider";
import { matchRunIntent, needsConfirmation, parseRunCommand, type RunTarget } from "@/lib/chatRuns";
import { ChatRunPicker } from "./ChatRunPicker";

/** A run waiting on the user's Confirm (release runs, free-text proposals). */
type PendingRun = { target: RunTarget; command: string; reason: string };

/** Live providers need a caller-supplied key when the server won't spend its own (public demo). */
const API_KEY_PROVIDERS: ChatProvider[] = ["groq", "google", "azure", "openai_compat"];

function commandFor(target: RunTarget): string {
  const selector = target.release === null ? "" : target.release === "latest" ? "@latest" : `@${target.release}`;
  const args = Object.entries(target.input)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => (/\s/.test(value) ? `${key}="${value}"` : `${key}=${value}`))
    .join(" ");
  return `/run ${target.graph.id}${selector}${args ? ` ${args}` : ""}`;
}

const rootStyle: CSSProperties = {
  display: "flex",
  height: "100%",
  minHeight: 0,
  width: "100%",
  flexDirection: "column",
  background: surface.panel,
  color: text.primary,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[2],
  borderBottom: `1px solid ${surface.border}`,
  padding: spacing[3],
};

const sectionLabelStyle: CSSProperties = {
  ...typeScale.caption,
  color: text.secondary,
};

const newSessionStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  flexDirection: "column",
  gap: spacing[3],
  padding: spacing[3],
  minHeight: 0,
  overflowY: "auto",
};

const contextStripStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[2],
  borderBottom: `1px solid ${surface.border}`,
  padding: `${spacing[1] + 2}px ${spacing[3]}px`,
  ...typeScale.caption,
};

const contextTextStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: text.secondary,
};

/**
 * Direct model scratchpad (studio-consolidation Phase 8 part E) — chats
 * straight to a chosen provider/model via `client.chatSessions.send`,
 * bypassing the graph engine entirely (confirmed with the user: not bound
 * to a node, not a multi-turn graph execution). Session persistence is a
 * day-one requirement (also confirmed), so sessions are listed/created via
 * the same `chatSessions` resource client every other resource kind uses.
 *
 * Token-styled (apps/studio/AGENTS.md): the chat panel lives on the
 * token-styled graph canvas, so it uses graph-theme tokens, not Tailwind.
 * The provider/model picker itself (`ProviderModelPicker`) is owned by the
 * provider-UX workstream and is used here unchanged.
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
  // Bring-your-own key for live providers. In-memory only (never persisted):
  // sent with each message so a chat session works even where the server
  // won't spend its own key (public demo mode).
  const [apiKey, setApiKey] = useState("");

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
      // The id suffix keeps titles distinct when two sessions start in the same second.
      title: `Scratchpad ${new Date().toLocaleString()} · ${id.slice(-4)}`,
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
      const runApiKey = apiKey.trim() || undefined;
      const summary = target.agent
        ? // An agent with an LLM profile picks its own model.
          await client.agents.run(target.agent.id, {
            input: target.input,
            ...(target.agent.llm_profile_id ? {} : { provider, model }),
            ...(runApiKey ? { apiKey: runApiKey } : {}),
          })
        : (
            releaseId
              ? await client.releases.run(releaseId, { input: target.input, provider, model, ...(runApiKey ? { apiKey: runApiKey } : {}) })
              : await client.runs.start({ graphId: target.graph.id, input: target.input, provider, model, ...(runApiKey ? { apiKey: runApiKey } : {}) })
          ).run;
      const run: ChatRunRef = {
        run_id: summary.run_id,
        graph_id: target.graph.id,
        graph_name: target.graph.name,
        ...(target.agent ? { agent_id: target.agent.id, agent_name: target.agent.name } : {}),
        source: releaseId ? "release" : "draft",
        release_id: releaseId,
        input: target.input,
      };
      const now = new Date().toISOString();
      await appendMessages(activeSession, [
        { role: "user", content: command, created_at: now },
        {
          role: "assistant",
          content: target.agent
            ? `Started agent ${target.agent.name} (${run.graph_name}) as ${run.run_id}.`
            : `Started ${run.graph_name} (${versionLabel(run)}) as ${run.run_id}.`,
          created_at: now,
          run,
        },
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
        const agents = /^\/run\s+@/i.test(content) ? await client.agents.list() : [];
        const command = parseRunCommand(content, list, agents);
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
      const updated = await client.chatSessions.send(activeSession.id, {
        content,
        context,
        apiKey: apiKey.trim() || undefined,
      });
      setActiveSession(updated);
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={rootStyle}>
      <div style={headerRowStyle}>
        {/* The wrapper's minWidth: 0 lets the combobox shrink below the
         * session title instead of pushing "New session" off the panel. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Combobox
            aria-label="Chat session"
            value={activeSession?.id ?? ""}
            options={sessions.map((session) => ({ value: session.id, label: session.title }))}
            onChange={(id) => {
              if (id) void openSession(id);
            }}
            placeholder={sessionsLoading ? "Loading sessions…" : "Select a session"}
            searchPlaceholder="Search sessions…"
            emptyMessage={sessions.length === 0 ? "No sessions yet" : "No matches"}
          />
        </div>
        <Button type="button" variant="secondary" onClick={() => void createSession()} style={{ flexShrink: 0 }}>
          New session
        </Button>
      </div>

      {!activeSession ? (
        <div style={newSessionStyle}>
          <div style={sectionLabelStyle}>Pick a provider/model for a new session:</div>
          <ProviderModelPicker
            provider={newProvider}
            model={newModel}
            onProviderChange={setNewProvider}
            onModelChange={setNewModel}
          />
          {API_KEY_PROVIDERS.includes(newProvider) && (
            <Field
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <KeyRound size={12} aria-hidden="true" />
                  API key
                </span>
              }
              hint="Sent with each message; kept in memory only, never stored."
            >
              {(id) => (
                <PasswordInput
                  id={id}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key for this provider"
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </Field>
          )}
          <ConversationEmptyState
            title="No session open"
            description="Select an existing session above, or create a new one."
          />
        </div>
      ) : (
        <>
          {graphContext && (
            <div style={contextStripStyle}>
              <span style={contextTextStyle}>
                Context: {graphContext.graphName || graphContext.graphId}
                {graphContext.selectedNodeId ? ` · Selected: ${graphContext.selectedNodeId}` : ""}
                {graphContext.runId ? ` · Run: ${graphContext.runId}` : ""}
              </span>
              <Button
                type="button"
                variant={includeContext ? "secondary" : "ghost"}
                onClick={() => setIncludeContext((v) => !v)}
                aria-pressed={includeContext}
                style={{ height: 24, fontSize: 12, padding: "0 8px", flexShrink: 0 }}
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
          {error && <div style={{ ...typeScale.caption, color: color.error[500], padding: `${spacing[1]}px ${spacing[3]}px` }}>{error}</div>}
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
            placeholder="Message the model, or /run <graph> …"
            actions={
              <IconButton
                label="Run a graph"
                icon={<Play style={{ width: 16, height: 16 }} aria-hidden />}
                aria-expanded={pickerOpen}
                pressed={pickerOpen}
                onClick={() => {
                  if (pickerOpen) {
                    setPickerOpen(false);
                    return;
                  }
                  void loadGraphs()
                    .then(() => setPickerOpen(true))
                    .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
                }}
              />
            }
          />
        </>
      )}
    </div>
  );
}
