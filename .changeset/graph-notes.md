---
"@bstockwelldev/agent-graph-sdk": minor
---

Add sticky notes to graphs: `GraphDefinition.notes` (`graphNoteSchema`, `graphNoteReplySchema`, `GraphNote` / `GraphNoteReply` types) with text, color, position, author, timestamps, an optional pinned node, a resolved flag and comment replies. Notes are display-only: `fingerprintGraph` (the dirty check) and `documentFingerprint` include them, `semanticFingerprint` doesn't, and a graph without notes keeps its digests.
