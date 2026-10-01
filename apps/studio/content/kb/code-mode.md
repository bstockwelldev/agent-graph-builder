---
id: code-mode
title: "Code mode"
summary: "Edit the whole graph as JSON or YAML"
category: concept
keywords: ["code", "code mode", "json", "yaml", "split", "raw", "config", "text", "codemirror", "graph config"]
related: ["validation", "canvas-basics"]
---
Code mode shows the graph as JSON or YAML text. The header's **Canvas | Code | Split** buttons switch views; Split shows the canvas and the code side by side.

## How do I…
- **Find a problem:** problems are marked in the gutter and listed under the editor; click one to jump to its line.
- **Apply:** **Apply** updates the canvas without saving (undoable).
- **Save:** ⌘S checks the text, shows what changed since the last save, and saves on confirm. If the check fails, your text stays as typed.

JSON is what's stored; YAML is only a view. The ⋯ menu's **Graph config** panel offers the same editing in a side panel.
