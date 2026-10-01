---
"@bstockwelldev/agent-graph-sdk": patch
---

An edge's `extensions.style` (line pattern, weight, color) is display-only: `semanticFingerprint` ignores it, matching the backend, and `fingerprintGraph` now includes edge `extensions` so a restyle marks the graph dirty.
