---
id: releases
title: "Releases"
summary: "Publish an immutable version of a graph"
category: concept
keywords: ["release", "releases", "publish", "version", "immutable", "fingerprint", "diff", "pin", "snapshot"]
related: ["replay", "policies", "node-subgraph"]
---
A release is a frozen copy of the graph, plus the exact versions of the prompts, tools, transforms and other resources it uses. Runs and subgraphs can target a release, so later edits don't change what they run.

## How do I…
- **Publish:** open **Releases** and press **Publish**. Blocking issues and policies marked "block publish" must be fixed or waived first.
- **Compare:** diff a release against another release or the unsaved canvas. Display-only changes (positions, edge styles) don't count.
- **Use a release elsewhere:** a Subgraph node can pin one, so the parent keeps running that exact version.
