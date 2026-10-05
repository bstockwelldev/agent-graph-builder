---
id: node-decision
title: "Decision node"
summary: "Classify and route with a constrained model"
category: node
keywords: ["decide", "classify", "route", "triage", "gate"]
related: ["node-router", "node-branch", "routing", "replay"]
---
A fast, constrained classifier that routes on a schema-validated outcome. Deterministic rules run first; a compact model (temperature 0, strict JSON schema) then decides; low-confidence outcomes fall back to the default edge — or fail the run closed when configured for state-changing graphs. Connect one Fallback (default) edge plus one conditional edge per outcome value; edge selection is exact-match on the outcome, never substring heuristics.
