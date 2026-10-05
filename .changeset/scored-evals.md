---
"@bstockwelldev/agent-graph-sdk": minor
---

Scored evals: `client.evals.suites` (CRUD for eval suites: a graph, a dataset and scorers), `client.evals.run(suiteId, { target?, provider?, model?, apiKey? })`, `client.evals.runs`, `client.evals.getRun` and `client.evals.compare`. Fixtures gain an optional `expected` (`output`, `contains`, `regex`, `json_fields`, `route`). The mock server adds the eval routes and an `eval-suites` resource kind.
