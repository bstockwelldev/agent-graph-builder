import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgePanel } from "./KnowledgePanel";
import { AgentGraphApiError } from "@bstockwelldev/agent-graph-sdk";

const { clientMock } = vi.hoisted(() => ({
  clientMock: {
    getKnowledge: vi.fn(),
    getKnowledgeLineage: vi.fn(),
    uploadKnowledgeDocument: vi.fn(),
    deleteKnowledgeDocument: vi.fn(),
  },
}));

vi.mock("@/lib/api-client", () => ({ client: clientMock }));

const doc = {
  id: "d1",
  name: "notes.md",
  mime_type: "text/markdown",
  uploaded_at: "2026-01-01T00:00:00Z",
  char_count: 1234,
};
const populated = {
  graphId: "g1",
  documents: [doc],
  chunkCount: 3,
  embeddingProvider: "openai",
  embeddingModelId: "text-embedding-3-small",
};
const empty = { graphId: "g1", documents: [], chunkCount: 0, embeddingProvider: null, embeddingModelId: null };
const lineageRow = {
  id: "k1",
  graph_id: "g1",
  document_id: "d1",
  document_name: "notes.md",
  chunk_id: "c1",
  run_id: "run_abcdef123456",
  node_id: "llm_1",
  score: 0.8123,
  created_at: "2026-01-02T00:00:00Z",
};

beforeEach(() => {
  Object.values(clientMock).forEach((fn) => fn.mockReset());
  clientMock.getKnowledgeLineage.mockResolvedValue([]);
  try {
    window.localStorage.clear();
  } catch {
    // localStorage unavailable — collapse state just isn't persisted
  }
});
afterEach(() => cleanup());

describe("KnowledgePanel", () => {
  it("shows the empty state for a graph with no documents", async () => {
    clientMock.getKnowledge.mockResolvedValue(empty);
    render(<KnowledgePanel graphId="g1" />);

    expect(await screen.findByText(/No documents yet/)).toBeTruthy();
    expect(clientMock.getKnowledge).toHaveBeenCalledWith("g1");
  });

  it("lists documents with embedding info and per-document usage", async () => {
    clientMock.getKnowledge.mockResolvedValue(populated);
    clientMock.getKnowledgeLineage.mockResolvedValue([lineageRow]);
    render(<KnowledgePanel graphId="g1" />);

    expect(await screen.findByText(/1 document · 3 chunks/)).toBeTruthy();
    expect(screen.getByText("openai/text-embedding-3-small")).toBeTruthy();
    expect(await screen.findByText(/1 retrieval across 1 run/)).toBeTruthy();
    expect(screen.getByText(/llm_1/)).toBeTruthy();
  });

  it("uploads the chosen file and shows the resulting document list", async () => {
    clientMock.getKnowledge.mockResolvedValue(empty);
    clientMock.uploadKnowledgeDocument.mockResolvedValue({
      ok: true,
      documentId: "d1",
      addedChunkCount: 3,
      ...populated,
    });
    render(<KnowledgePanel graphId="g1" />);
    await screen.findByText(/No documents yet/);

    const file = new File(["hello"], "notes.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Upload knowledge document"), { target: { files: [file] } });

    expect(await screen.findByText("notes.md")).toBeTruthy();
    expect(clientMock.uploadKnowledgeDocument).toHaveBeenCalledWith("g1", file);
  });

  it("surfaces the backend's error detail when an upload fails", async () => {
    clientMock.getKnowledge.mockResolvedValue(empty);
    clientMock.uploadKnowledgeDocument.mockRejectedValue(
      new AgentGraphApiError({ status: 503, method: "POST", path: "/api/graphs/g1/knowledge", url: "/api/graphs/g1/knowledge", body: JSON.stringify({ detail: "No embedding provider configured" }) }),
    );
    render(<KnowledgePanel graphId="g1" />);
    await screen.findByText(/No documents yet/);

    const file = new File(["hello"], "notes.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Upload knowledge document"), { target: { files: [file] } });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("No embedding provider configured");
  });

  it("requires a second click to confirm removing a document", async () => {
    clientMock.getKnowledge.mockResolvedValue(populated);
    clientMock.deleteKnowledgeDocument.mockResolvedValue({ ok: true, ...empty });
    render(<KnowledgePanel graphId="g1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove notes.md" }));
    expect(clientMock.deleteKnowledgeDocument).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm remove notes.md" }));
    await waitFor(() => expect(clientMock.deleteKnowledgeDocument).toHaveBeenCalledWith("g1", "d1"));
    expect(await screen.findByText(/No documents yet/)).toBeTruthy();
  });

  it("cancelling a pending remove leaves the document in place", async () => {
    clientMock.getKnowledge.mockResolvedValue(populated);
    render(<KnowledgePanel graphId="g1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove notes.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Remove notes.md" })).toBeTruthy();
    expect(clientMock.deleteKnowledgeDocument).not.toHaveBeenCalled();
  });

  it("still lists documents when the lineage request fails", async () => {
    clientMock.getKnowledge.mockResolvedValue(populated);
    clientMock.getKnowledgeLineage.mockRejectedValue(new Error("lineage exploded"));
    render(<KnowledgePanel graphId="g1" />);

    expect(await screen.findByText("notes.md")).toBeTruthy();
    expect(await screen.findByText(/Couldn't load usage: lineage exploded/)).toBeTruthy();
  });

  it("makes no requests without a graph id", () => {
    render(<KnowledgePanel graphId={null} />);

    expect(clientMock.getKnowledge).not.toHaveBeenCalled();
    expect(screen.getByText(/No documents yet/)).toBeTruthy();
  });
});
