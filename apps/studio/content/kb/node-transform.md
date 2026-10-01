---
id: node-transform
title: "Transform node"
summary: "Reshape data between steps"
category: node
keywords: ["reshape", "select", "wrap", "format", "coerce"]
related: ["transforms", "ports-and-contracts"]
---
Deterministically reshapes the upstream value: select a field (JSON Pointer), wrap it under a field, format a text message, or convert it to a string, number or boolean. No code and no model call; a value that doesn't fit fails the step. Use one inline or bind a saved transform from Resources → Transforms.
