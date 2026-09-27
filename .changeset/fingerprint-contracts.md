---
"@bstockwelldev/agent-graph-sdk": patch
---

`fingerprintGraph` and `fingerprintGraphSemantics` now include declared node ports and edge contracts (`source_port`, `target_port`, `transform`). Before this, declaring a port or adding an edge transform in the Studio didn't mark the graph unsaved. Contracts are normalized first, so the API's `null`-filled copy of a contract fingerprints the same as the authored one.
