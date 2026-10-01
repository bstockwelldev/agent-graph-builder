---
id: genui
title: "GenUI surfaces"
summary: "Structured, interactive content for approvals and results"
category: concept
keywords: ["genui", "surface", "surfaces", "approval card", "chart", "table", "diff", "form", "ui"]
related: ["node-human-gate", "runs-and-traces"]
---
A GenUI surface is a small JSON description of UI, such as a summary, chart, table, diff, diagram or form, that the studio renders safely. Human gates use them to show what needs approval; values bind to run data with `{"$ref": "/nodes/<id>/output"}`.

## How do I…
- **Browse and preview surfaces:** the **GenUI** page.
- **Use one at a checkpoint:** set it on a Human gate node. Form values the approver enters become a run variable named after the gate.
