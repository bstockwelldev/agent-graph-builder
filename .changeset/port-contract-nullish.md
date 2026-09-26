---
"@bstockwelldev/agent-graph-sdk": patch
---

`portContractSchema` fields (`schema`, `required`, `classification`) are now nullish: the API serializes unset fields as `null`, which previously failed to parse any graph with declared ports.
