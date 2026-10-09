---
id: scored-evals
title: "Scored evals"
summary: "Score a graph against a dataset's expected results"
category: panel
keywords: ["eval", "evals", "evaluation", "score", "scorer", "suite", "expected", "regression", "pass rate", "quality", "benchmark"]
related: ["datasets", "routing-lab", "releases"]
---
An eval suite runs a graph once per fixture in a [dataset](kb:datasets) and scores each run against the fixture's `expected` fields. Each run is stored, so you can compare one with the next.

## How do I…
- **Say what's right:** give fixtures an `expected` object: `output` (exact match), `contains` (strings), `regex`, `json_fields` (JSON pointer to value) or `route` (router id to the node it should pick).
- **Make a suite:** open **Eval suites** in Resources, or **Evals** from the graph's ⋯ menu and pick a dataset. Choose scorers and a pass mark; a case's score is the weighted mean of the scorers that had something to check.
- **Run it:** in **Evals**, pick the saved draft or a release, and a provider. Stub is the default and never calls a model. A live provider needs an API key in the public demo; it's used for that run only and never stored. Each case links to its run.
- **Spot a regression:** in **History**, **Compare** shows how the score and pass rate moved, case by case.

Runs stop at 50 cases; live runs also stop after about 45 seconds and say "stopped early".
