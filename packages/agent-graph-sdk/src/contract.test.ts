import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// @ts-expect-error -- plain ESM script, no type declarations
import { renderGenerated } from "../scripts/generate.mjs";
import * as schemas from "./schemas.js";

// SDK 3/7 (STO-616): the SDK's side of the contract drift check. The
// backend's pytest guards contract/openapi.json against the app; these
// guard the SDK against contract/openapi.json.

const contract = JSON.parse(readFileSync(new URL("../contract/openapi.json", import.meta.url), "utf8"));
const components: Record<string, { properties?: Record<string, unknown> }> = contract.components.schemas;

/** Hand-written schemas named differently from their Pydantic model. */
const COMPONENT_ALIASES: Record<string, string> = {
  subgraphExtractResponseSchema: "ExtractSubgraphResponse",
};

/** Hand-written schemas for responses the backend returns as untyped
 * dicts (no component in the contract yet). Adding a schema that is
 * neither in the contract nor here fails the coverage test, so the choice
 * is always deliberate. */
const UNTYPED_ON_BACKEND = new Set([
  "agentProfileSchema",
  "chatMessageSchema",
  "chatRunRefSchema",
  "chatSessionSchema",
  "deletedSchema",
  "fixtureDatasetSchema",
  "knowledgeDeleteResponseSchema",
  "knowledgeDocumentSchema",
  "knowledgeSummarySchema",
  "knowledgeUploadResponseSchema",
  "llmProfileSchema",
  "mcpServerConfigSchema",
  "promptTemplateSchema",
  "providerCredentialsSchema",
  "providerModelCatalogSchema",
  "providerModelOptionSchema",
  "providerReadySchema",
  "releaseIndexEntrySchema",
  "resourceVersionIndexEntrySchema",
  "toolDefinitionSchema",
]);

function componentFor(exportName: string): string {
  return COMPONENT_ALIASES[exportName] ?? exportName[0].toUpperCase() + exportName.slice(1, -"Schema".length);
}

const objectSchemas = Object.entries(schemas).filter(
  (entry): entry is [string, z.AnyZodObject] => entry[0].endsWith("Schema") && entry[1] instanceof z.ZodObject,
);

describe("OpenAPI contract", () => {
  it("generated types are up to date with contract/openapi.json", async () => {
    const committed = readFileSync(new URL("./generated/openapi.ts", import.meta.url), "utf8");
    expect(committed === (await renderGenerated()), "src/generated/openapi.ts is stale -- run `pnpm --filter @bstockwelldev/agent-graph-sdk run generate`").toBe(true);
  });

  it("every hand-written response schema covers every field of its contract model", () => {
    const gaps: string[] = [];
    for (const [name, schema] of objectSchemas) {
      const component = components[componentFor(name)];
      if (!component) continue;
      const shape = Object.keys(schema.shape);
      for (const property of Object.keys(component.properties ?? {})) {
        if (!shape.includes(property)) gaps.push(`${name} lacks "${property}" (${componentFor(name)})`);
      }
      for (const field of shape) {
        if (!(field in (component.properties ?? {}))) gaps.push(`${name} has "${field}", which ${componentFor(name)} doesn't`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it("every hand-written object schema maps to a contract model or is listed as untyped on the backend", () => {
    const unmapped = objectSchemas.map(([name]) => name).filter((name) => !components[componentFor(name)] && !UNTYPED_ON_BACKEND.has(name));
    expect(unmapped).toEqual([]);
    const stale = [...UNTYPED_ON_BACKEND].filter((name) => components[componentFor(name)]);
    expect(stale, "these now have contract models -- remove them from UNTYPED_ON_BACKEND").toEqual([]);
  });
});

describe("API version skew", () => {
  const withVersion = (version: string | null) =>
    new Response(JSON.stringify([]), { headers: { "content-type": "application/json", ...(version ? { "X-AGB-API-Version": version } : {}) } });

  it("warns once when the server is ahead by minor or major, never when equal, behind or absent", async () => {
    const { createAgentGraphClient, isServerAhead } = await import("./client.js");
    const { CONTRACT_API_VERSION } = await import("./generated/openapi.js");
    const [major, minor] = CONTRACT_API_VERSION.split(".").map(Number);
    const ahead = `${major}.${minor + 1}.0`;
    const onVersionSkew = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(withVersion(CONTRACT_API_VERSION))
      .mockResolvedValueOnce(withVersion(null))
      .mockResolvedValueOnce(withVersion(ahead))
      .mockResolvedValueOnce(withVersion(`${major + 1}.0.0`));
    const client = createAgentGraphClient({ fetch, onVersionSkew });
    for (let i = 0; i < 4; i++) await client.listGraphs();
    expect(onVersionSkew).toHaveBeenCalledTimes(1);
    expect(onVersionSkew).toHaveBeenCalledWith({ serverVersion: ahead, clientVersion: CONTRACT_API_VERSION });

    expect([isServerAhead("0.4.0", "0.3.9"), isServerAhead("1.0.0", "0.9.0"), isServerAhead("0.3.5", "0.3.0"), isServerAhead("0.2.0", "0.3.0")]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("defaults to a console warning, and false silences it", async () => {
    const { createAgentGraphClient } = await import("./client.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await createAgentGraphClient({ fetch: vi.fn().mockResolvedValue(withVersion("99.0.0")) }).listGraphs();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("99.0.0");
    warn.mockClear();
    await createAgentGraphClient({ fetch: vi.fn().mockResolvedValue(withVersion("99.0.0")), onVersionSkew: false }).listGraphs();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
