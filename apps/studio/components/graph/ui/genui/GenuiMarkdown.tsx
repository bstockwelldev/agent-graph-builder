"use client";

import type { ReactNode } from "react";

import { color, fontFamily, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";

/**
 * A small, safe Markdown subset for GenUI text: # headings, paragraphs,
 * - and 1. lists, ``` code blocks, **bold**, *italic*, `code` and
 * [links](https://...). Rendered as React elements (never raw HTML), and
 * only http(s)/mailto links are live.
 */
type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; text: string };

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      i++;
      continue;
    }
    const listItem = /^\s*(?:[-*]|\d+[.)])\s+/;
    if (listItem.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && listItem.test(lines[i])) items.push(lines[i++].replace(listItem, ""));
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s/.test(lines[i]) && !listItem.test(lines[i]) && !lines[i].trimStart().startsWith("```")) {
      paragraph.push(lines[i++].trim());
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }
  return blocks;
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** `onKbLink` turns `[label](kb:article-id)` links into in-app buttons (the Help panel); without it they render as text. */
export function renderInline(source: string, onKbLink?: (articleId: string) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let key = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > last) nodes.push(source.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key++} style={{ fontFamily: fontFamily.mono, fontSize: "0.9em", background: surface.page, borderRadius: radius.sm, padding: "0 4px" }}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      nodes.push(
        href?.startsWith("kb:") && onKbLink ? (
          <button
            key={key++}
            type="button"
            className="agb-focus-ring"
            onClick={() => onKbLink(href.slice(3))}
            style={{ padding: 0, border: "none", background: "transparent", color: color.primary[500], textDecoration: "underline", cursor: "pointer", font: "inherit" }}
          >
            {label}
          </button>
        ) : SAFE_URL.test(href ?? "") ? (
          <a key={key++} href={href} target="_blank" rel="noreferrer noopener" style={{ color: color.primary[500], textDecoration: "underline" }}>
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    last = match.index + token.length;
  }
  if (last < source.length) nodes.push(source.slice(last));
  return nodes;
}

const HEADING = { 1: typeScale.subheading, 2: typeScale.small, 3: typeScale.small } as const;

export function GenuiMarkdown({ content, onKbLink }: { content: string; onKbLink?: (articleId: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[2], color: text.primary, fontSize: 13, lineHeight: "20px" }}>
      {parseMarkdown(content).map((block, index) => {
        switch (block.kind) {
          case "heading": {
            const Tag = `h${block.level + 2}` as "h3" | "h4" | "h5";
            return (
              <Tag key={index} style={{ margin: 0, ...HEADING[block.level], color: text.primary }}>
                {renderInline(block.text, onKbLink)}
              </Tag>
            );
          }
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={index} style={{ margin: 0, paddingLeft: 20 }}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item, onKbLink)}</li>
                ))}
              </Tag>
            );
          }
          case "code":
            return (
              <pre key={index} style={{ margin: 0, padding: spacing[2], borderRadius: radius.md, background: surface.page, fontFamily: fontFamily.mono, fontSize: 12, overflowX: "auto" }}>
                {block.text}
              </pre>
            );
          default:
            return (
              <p key={index} style={{ margin: 0 }}>
                {renderInline(block.text, onKbLink)}
              </p>
            );
        }
      })}
    </div>
  );
}
