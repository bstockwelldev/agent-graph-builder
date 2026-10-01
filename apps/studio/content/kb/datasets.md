---
id: datasets
title: "Datasets"
summary: "Saved inputs (and recorded outputs) to test a graph against"
category: resource
keywords: ["dataset", "datasets", "fixture", "fixtures", "test cases", "simulation", "capture"]
related: ["routing-lab", "runs-and-traces"]
---
A dataset is a list of fixtures: run inputs, optionally with recorded node outputs. Use them to simulate a graph without calling a model, and to check routing in the Routing lab.

## How do I…
- **Create one:** **Resources ▸ Datasets** ▸ New, then add fixtures as JSON.
- **Capture runs:** in the Run panel's history, select runs and choose **Save as dataset**.
- **Use one:** **Run with fixture…** (Run menu) runs one fixture without calling a model; the [Routing lab](kb:routing-lab) runs them all.
