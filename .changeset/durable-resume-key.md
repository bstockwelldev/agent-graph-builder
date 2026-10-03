---
"@bstockwelldev/agent-graph-sdk": minor
---

`client.runs.resume` accepts `apiKey`. Paused runs now resume on any instance and after a restart, but a run's API key is never stored, so a run on a keyed provider needs it resent (the API answers 409 without it).
