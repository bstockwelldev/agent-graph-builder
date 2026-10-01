---
id: transforms
title: "Transforms"
summary: "Reshape a value between steps without code"
category: concept
keywords: ["transform", "transforms", "reshape", "select", "json pointer", "wrap", "format message", "template", "coerce", "convert", "library"]
related: ["node-transform", "ports-and-contracts"]
---
A transform reshapes a value deterministically: **Select** a field with a JSON Pointer (`/answer`), **Wrap** it under a field, **Format message** with a template (`Topic: {value.topic}`), or **Coerce** it to a string, number or boolean. There's no code and no model call; a value that doesn't fit fails the step with a clear error.

## Where transforms go
- **On an edge:** select the edge ▸ **Transform**. The value is reshaped as it crosses the edge. **Try it** previews the result.
- **As a step:** add a Transform node.
- **In the library:** save one under **Resources ▸ Transforms** and bind it by id from an edge or a node, so one change updates every use. Releases pin the version they used.
