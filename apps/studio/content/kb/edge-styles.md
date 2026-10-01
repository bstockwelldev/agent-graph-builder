---
id: edge-styles
title: "Edge styles"
summary: "Line pattern, weight and color for an edge"
category: concept
keywords: ["edge style", "line", "dashed", "dotted", "solid", "thick", "color", "colour", "pattern", "weight"]
related: ["edge-sequence", "edge-conditional", "edge-default"]
---
Each edge kind has a default pattern: Always is solid, Match text dashed and Fallback dotted. You can restyle any edge; styles are for display only and never change what runs, or a release's diff.

## How do I…
- Select an edge and use the inspector's **Style** group, or right-click it ▸ **Style**. **Reset style** goes back to the defaults.

A running edge stays animated, a failed one stays red, and a validation problem keeps its color, whatever the style.
