"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ChatProvider } from "@bstockwelldev/agent-graph-sdk";
import { runModelArg } from "@/lib/modelCatalog";

/**
 * The Run panel's provider and model. It is a run-time override, held in memory only: it is
 * never written into the graph. Shared so node cards can show what each LLM node would run on.
 */
export type RunSelectionValue = {
  provider: ChatProvider;
  selectedModel: string;
  setProvider: (provider: ChatProvider) => void;
  setSelectedModel: (model: string) => void;
};

export function useRunSelectionState(): RunSelectionValue {
  const [provider, setProvider] = useState<ChatProvider>("stub");
  const [selectedModel, setSelectedModel] = useState("");
  return useMemo(() => ({ provider, selectedModel, setProvider, setSelectedModel }), [provider, selectedModel]);
}

const RunSelectionContext = createContext<RunSelectionValue | null>(null);

export function RunSelectionProvider({ value, children }: { value: RunSelectionValue; children: ReactNode }) {
  return <RunSelectionContext.Provider value={value}>{children}</RunSelectionContext.Provider>;
}

/** The shared selection, or null outside a graph editor (node cards then use their legacy summary). */
export function useRunSelection(): RunSelectionValue | null {
  return useContext(RunSelectionContext);
}

/** For the Run panel itself: the shared selection, or its own local one when rendered standalone. */
export function useRunSelectionOrLocal(): RunSelectionValue {
  const shared = useContext(RunSelectionContext);
  const local = useRunSelectionState();
  return shared ?? local;
}

/** What a node card needs: the run provider and the model the run would send (if any). */
export function useRunSelectionSummary(): { provider: ChatProvider; model?: string } | undefined {
  const selection = useRunSelection();
  if (!selection) return undefined;
  return { provider: selection.provider, model: runModelArg(selection.provider, selection.selectedModel) };
}
