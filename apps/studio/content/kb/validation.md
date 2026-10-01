---
id: validation
title: "Validation and issues"
summary: "Errors, warnings and how to fix them"
category: concept
keywords: ["validate", "validation", "diagnostic", "diagnostics", "error", "warning", "issue", "issues", "blocking", "compile", "what's this warning"]
related: ["ports-and-contracts", "policies", "routing"]
---
The studio validates the graph as you edit. **Errors** block runs and releases; **warnings** don't block, but point at something that may not work as intended.

Issues come from four checks: **structure** (entry node, reachability, router edges), **contracts** (port kinds), **policies** (workspace and graph rules) and **capabilities** (what the runtime supports).

## How do I…
- **See all issues:** the header's validation chip and the Run panel's **Issues** tab list them.
- **Jump to one:** click it. The canvas pans to the node or edge and opens the tab that holds the setting.
- **Read the details:** each issue names the node or edge; the inspector shows field-level issues next to the field.
