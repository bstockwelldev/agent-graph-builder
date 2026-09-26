import { describe, expect, it } from "vitest";

import { formatConfigJson, formatEdgeRawConfig, fromCanonicalJson, parseConfigJson, parseEdgeRawConfig, toCanonicalJson } from "./jsonEditor";

describe("parseConfigJson", () => {
  it("accepts a valid JSON object", () => {
    const result = parseConfigJson('{"provider": "groq", "temperature": 0.2}');
    expect(result).toEqual({ ok: true, value: { provider: "groq", temperature: 0.2 } });
  });

  it("accepts an empty object", () => {
    expect(parseConfigJson("{}")).toEqual({ ok: true, value: {} });
  });

  it("rejects malformed JSON", () => {
    const result = parseConfigJson("{provider: groq}");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Invalid JSON/);
  });

  it("rejects a top-level array", () => {
    const result = parseConfigJson("[1, 2, 3]");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/must be a JSON object/);
  });

  it("rejects a top-level scalar", () => {
    const result = parseConfigJson('"just a string"');
    expect(result.ok).toBe(false);
  });

  it("rejects null", () => {
    const result = parseConfigJson("null");
    expect(result.ok).toBe(false);
  });
});

describe("formatConfigJson", () => {
  it("pretty-prints with 2-space indentation", () => {
    expect(formatConfigJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("round-trips through parseConfigJson without losing or reordering keys", () => {
    const original = { zeta: 1, alpha: 2, middle: { nested: true } };
    const formatted = formatConfigJson(original);
    const parsed = parseConfigJson(formatted);
    expect(parsed).toEqual({ ok: true, value: original });
    if (parsed.ok) expect(Object.keys(parsed.value)).toEqual(Object.keys(original));
  });
});

describe("parseEdgeRawConfig / formatEdgeRawConfig", () => {
  it("accepts a valid edge kind/condition pair", () => {
    expect(parseEdgeRawConfig('{"kind": "conditional", "condition": "yes"}')).toEqual({
      ok: true,
      value: { kind: "conditional", condition: "yes", source_port: null, target_port: null, transform: null },
    });
  });

  it("defaults a missing condition to null", () => {
    expect(parseEdgeRawConfig('{"kind": "sequence"}')).toEqual({
      ok: true,
      value: { kind: "sequence", condition: null, source_port: null, target_port: null, transform: null },
    });
  });

  it("rejects an invalid kind", () => {
    const result = parseEdgeRawConfig('{"kind": "loop"}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/must be one of/);
  });

  it("rejects a non-string, non-null condition", () => {
    const result = parseEdgeRawConfig('{"kind": "conditional", "condition": 5}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/condition.*must be a string or null/);
  });

  it("round-trips through formatEdgeRawConfig", () => {
    const formatted = formatEdgeRawConfig({ kind: "default", condition: null });
    expect(parseEdgeRawConfig(formatted)).toEqual({ ok: true, value: { kind: "default", condition: null, source_port: null, target_port: null, transform: null } });
  });

  it("includes the transform, dropping unset fields", () => {
    const formatted = formatEdgeRawConfig({ kind: "sequence", transform: { type: "select", pointer: "/a", field: null, template: null, target_type: null } });
    expect(JSON.parse(formatted)).toEqual({ kind: "sequence", condition: null, source_port: null, target_port: null, transform: { type: "select", pointer: "/a" } });
    expect(parseEdgeRawConfig(formatted)).toEqual({
      ok: true,
      value: { kind: "sequence", condition: null, source_port: null, target_port: null, transform: { type: "select", pointer: "/a" } },
    });
  });

  it("carries source/target ports and rejects blank ones", () => {
    const formatted = formatEdgeRawConfig({ kind: "sequence", source_port: "decision" });
    expect(parseEdgeRawConfig(formatted)).toEqual({
      ok: true,
      value: { kind: "sequence", condition: null, source_port: "decision", target_port: null, transform: null },
    });
    const blank = parseEdgeRawConfig('{"kind": "sequence", "target_port": " "}');
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.error).toMatch(/target_port/);
  });

  it("rejects an invalid transform with its path", () => {
    const result = parseEdgeRawConfig('{"kind": "sequence", "transform": {"type": "reshape"}}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/^transform\.type:/);
  });
});

describe("JSON / YAML views", () => {
  it("round-trips a value through YAML without changing it", () => {
    const json = formatConfigJson({ provider: "groq", temperature: 0.2, tags: ["a", "b"], nested: { on: true, none: null } });
    const yaml = fromCanonicalJson(json, "yaml");
    expect(yaml).toContain("provider: groq");
    expect(toCanonicalJson(yaml, "yaml")).toEqual({ ok: true, json });
  });

  it("keeps YAML-ambiguous strings as strings", () => {
    const json = formatConfigJson({ answer: "yes", version: "1.10", empty: "" });
    const back = toCanonicalJson(fromCanonicalJson(json, "yaml"), "yaml");
    expect(back).toEqual({ ok: true, json });
  });

  it("reports invalid YAML and duplicate keys", () => {
    const bad = toCanonicalJson("a: [1, 2", "yaml");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/^Invalid YAML/);
    expect(toCanonicalJson("a: 1\na: 2", "yaml").ok).toBe(false);
  });

  it("passes JSON through untouched", () => {
    expect(toCanonicalJson('{"a":1}', "json")).toEqual({ ok: true, json: '{"a":1}' });
    expect(fromCanonicalJson('{"a":1}', "json")).toBe('{"a":1}');
  });

  it("feeds YAML through the existing validators", () => {
    const converted = toCanonicalJson("kind: conditional\ncondition: technical", "yaml");
    expect(converted.ok && parseEdgeRawConfig(converted.json)).toEqual({ ok: true, value: { kind: "conditional", condition: "technical", source_port: null, target_port: null, transform: null } });
  });
});
