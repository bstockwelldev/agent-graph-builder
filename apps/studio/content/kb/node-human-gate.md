---
id: node-human-gate
title: "Human gate node"
summary: "Pause the run for approval"
category: node
keywords: ["approval", "approve", "reject", "pause", "checkpoint", "human in the loop"]
related: ["genui", "runs-and-traces"]
---
Pauses the run at a checkpoint until someone approves or rejects it in the Run panel (or via POST /api/runs/{id}/resume). A GenUI surface can show what's being approved and collect values.

A paused run waits as long as needed: it can be approved later, from any browser, even after the server restarts. If the run uses a provider that needs an API key, approving asks for the key again (keys are never stored).
