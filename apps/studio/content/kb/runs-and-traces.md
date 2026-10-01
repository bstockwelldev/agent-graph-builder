---
id: runs-and-traces
title: "Runs, traces and events"
summary: "Run a graph and inspect what each step did"
category: concept
keywords: ["run", "runs", "trace", "traces", "events", "event log", "waterfall", "history", "stream", "output", "node output", "debug"]
related: ["providers", "replay", "console", "node-human-gate"]
---
A run executes the graph once with your input. Each node reports when it starts, finishes, fails or pauses, and the studio shows these events live.

## How do I…
- **Run:** open **Run**, fill in the inputs, choose a provider, and press **Run** (⌘↵).
- **See a step's input and output:** click the node, then its **Run** tab.
- **See timing:** the Run panel's waterfall shows each step's duration; click a bar to open that step.
- **Find an old run:** the Run panel's history lists past runs. Open one to inspect it or [replay](kb:replay) it.
- **Approve a paused run:** a Human gate pauses the run; approve or reject it in the Run panel.
