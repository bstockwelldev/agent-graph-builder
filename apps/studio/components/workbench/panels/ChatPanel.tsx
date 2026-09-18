"use client";

import { useEffect, useState } from "react";
import type { ChatSession } from "@bstockwelldev/agent-graph-sdk";
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
import { useWorkbench } from "@/components/workbench/WorkbenchProvider";

/**
 * Direct model scratchpad (studio-consolidation Phase 8 part E) — chats
 * straight to a chosen provider/model via `client.sendChatMessage`,
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

  async function sendMessage(content: string) {
    if (!activeSession) return;
    setSending(true);
    setError(null);
    try {
      const updated = await client.sendChatMessage(activeSession.id, content);
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
          <Conversation autoScrollKey={activeSession.messages.length}>
            <ConversationContent>
              {activeSession.messages.length === 0 ? (
                <ConversationEmptyState />
              ) : (
                activeSession.messages.map((message, index) => (
                  <Message key={index} from={message.role}>
                    <MessageContent from={message.role}>{message.content}</MessageContent>
                  </Message>
                ))
              )}
              {sending && <Shimmer />}
            </ConversationContent>
          </Conversation>
          {error && <div className="text-destructive px-3 py-1 text-xs">{error}</div>}
          <PromptInput onSubmit={(text) => void sendMessage(text)} disabled={sending} className="border-t" />
        </>
      )}
    </div>
  );
}
