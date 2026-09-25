---
"@bstockwelldev/agent-graph-sdk": patch
---

`edgeTransformSchema` fields are now nullish: the API serializes unset transform fields as `null`, which previously failed to parse any graph containing an edge transform.
