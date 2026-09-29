import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  client: {
    mcpServers: {
      list: vi.fn(async () => [{ id: "srv", name: "Docs MCP", url: "https://x", transport: "http", enabled: true }]),
      discover: vi.fn(async () => ({
        ok: true,
        error: null,
        tools: [{ name: "search_docs", description: "Search the docs", input_schema: { type: "object", properties: { q: { type: "string" } } } }],
      })),
      headers: { get: vi.fn(async () => ({ names: ["Authorization"] })) },
    },
    tools: { list: vi.fn(async () => []), create: vi.fn(async (tool: unknown) => tool) },
  },
}));
vi.mock("@/lib/api-client", () => api);

import { HeadersField, McpDiscoverySection, headerIssues, headersUpdate, registryToolId, type HeaderRow } from "./mcp-server-fields";
import { ToolSourceFields, type ToolForm } from "./tool-source-fields";

afterEach(cleanup);

// resource-forms-consistency-plan.md, slice 3.
describe("MCP server fields", () => {
  it("validates header rows and keeps stored values unless replaced", () => {
    const rows: HeaderRow[] = [
      { name: "Authorization", value: "", stored: true },
      { name: "X-Team", value: "docs", stored: false },
      { name: "", value: "", stored: false },
    ];
    expect(headerIssues(rows)).toEqual([]);
    expect(headersUpdate(rows)).toEqual({ Authorization: null, "X-Team": "docs" });
    expect(headerIssues([{ name: "X-New", value: " ", stored: false }])).toEqual(["Add a value for header X-New."]);
    expect(headerIssues([{ name: "Bad Name", value: "v", stored: false }])).toEqual(['"Bad Name" isn\'t a valid header name.']);
    expect(headerIssues([{ name: "a", value: "1", stored: false }, { name: "A", value: "2", stored: false }])).toEqual(["Header A is listed twice."]);
    expect(registryToolId("srv 1", "search/docs")).toBe("srv_1.search_docs");
  });

  it("loads an existing server's header names without their values", async () => {
    const onLoad = vi.fn();
    render(<HeadersField idPrefix="t" serverId="srv" rows={undefined} onLoad={onLoad} onChange={vi.fn()} />);
    await vi.waitFor(() => expect(onLoad).toHaveBeenCalledWith([{ name: "Authorization", value: "", stored: true }]));
    cleanup();
    render(<HeadersField idPrefix="t" serverId="srv" rows={onLoad.mock.calls[0][0]} onLoad={vi.fn()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Header Authorization value").getAttribute("placeholder")).toBe("Stored; type to replace");
  });

  it("tests the connection and adds a discovered tool to the registry", async () => {
    render(<McpDiscoverySection server={{ id: "srv", name: "Docs MCP", url: "https://x", transport: "http", enabled: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Test connection/ }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Connected · 1 tool");
    fireEvent.click(within(status).getByRole("button", { name: "Add search_docs to the tool registry" }));
    await vi.waitFor(() =>
      expect(api.client.tools.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: "srv.search_docs", mcp_server_id: "srv", mcp_tool_name: "search_docs", description: "Search the docs" }),
      ),
    );
    expect(await within(status).findByText("srv.search_docs")).toBeTruthy();
  });

  // Opening a Base UI select hangs jsdom, so picking is covered in e2e
  // (e2e/specs/mcp.spec.ts); this starts from a bound tool.
  it("shows a bound tool's server tool and its read-only schema, and Mock drops the binding", async () => {
    function Harness() {
      const [form, setFormState] = useState<Partial<ToolForm>>({
        id: "t",
        description: "d",
        parameters_json: '{"type":"object"}',
        mcp_server_id: "srv",
        mcp_tool_name: "search_docs",
      });
      return (
        <>
          <ToolSourceFields idPrefix="t" form={form} setForm={(patch) => setFormState((prev) => ({ ...prev, ...patch }))} parametersError={null} />
          <output data-testid="form">{JSON.stringify(form)}</output>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "MCP server" }).getAttribute("aria-checked")).toBe("true");
    await vi.waitFor(() => expect(api.client.mcpServers.discover).toHaveBeenCalledWith("srv"));
    const params = (await screen.findByLabelText("Parameters (from the server)")) as HTMLTextAreaElement;
    expect(params.readOnly).toBe(true);
    expect(screen.getByRole("combobox", { name: "Server tool" }).textContent).toContain("search_docs");

    fireEvent.click(screen.getByRole("radio", { name: "Mock" }));
    expect(JSON.parse(screen.getByTestId("form").textContent!)).toMatchObject({ _source: "mock", mcp_server_id: null, mcp_tool_name: null });
    expect((screen.getByLabelText("Parameters (JSON Schema)") as HTMLTextAreaElement).readOnly).toBe(false);
  });

  it("falls back to typing the tool name when discovery fails", async () => {
    api.client.mcpServers.discover.mockResolvedValueOnce({ ok: false, tools: [], error: "HTTP 401" } as never);
    render(<ToolSourceFields idPrefix="t" form={{ id: "t", mcp_server_id: "srv", mcp_tool_name: "" }} setForm={vi.fn()} parametersError={null} />);
    expect(await screen.findByText(/Couldn't connect: HTTP 401/)).toBeTruthy();
    expect(screen.getByPlaceholderText("Tool name on the server")).toBeTruthy();
  });
});
