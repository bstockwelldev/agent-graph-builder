---
id: routing
title: "Routing with routers and branches"
summary: "How a router picks one outgoing edge"
category: concept
keywords: ["router", "route", "routing", "branch", "condition", "match", "fallback", "acyclic", "loop", "cycle"]
related: ["node-router", "node-branch", "edge-conditional", "edge-default", "routing-lab"]
---
Mark outgoing edges as Fallback (default) or Match text (conditional, substring of upstream LLM output). The compiler requires exactly one Fallback. Loops are not supported (acyclic graphs only).

## How do I…
- **Add a route:** connect the router to the next step; when asked, choose **Match text** and enter the text to look for.
- **Change an edge's kind:** select it and use **Kind** in the inspector, or right-click ▸ Kind.
- **Check where questions go:** run a dataset through the [Routing lab](kb:routing-lab) to see the route distribution.
