---
id: ports-and-contracts
title: "Ports and contracts"
summary: "What a step takes and returns, and the warnings when they don't fit"
category: concept
keywords: ["port", "ports", "contract", "kind", "message", "structured-json", "tool-result", "mismatch", "contract warning", "input port", "output port"]
related: ["transforms", "validation", "node-transform"]
---
Every node has typed input and output ports, such as `message`, `structured-json` or `tool-result`. An edge connects an output port to an input port, and the validator checks that their kinds fit.

A **contract warning** means an edge carries one kind into a port that expects another. The run still starts, but the receiving step may not get what it needs.

## How do I…
- **See a node's ports:** open its **I/O** tab in the inspector. You can add or rename ports there.
- **Fix a kind mismatch:** add a [transform](kb:transforms) on the edge (Edge ▸ Transform) or splice a Transform node between the two steps.
- **Pick specific ports:** select the edge and choose its source and target ports in the inspector.
