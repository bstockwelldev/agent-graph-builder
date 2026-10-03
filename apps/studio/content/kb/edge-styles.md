---
id: edge-styles
title: "Edge styles"
summary: "Routing, line pattern, weight and color for an edge"
category: concept
keywords: ["edge style", "line", "dashed", "dotted", "solid", "thick", "color", "colour", "pattern", "weight", "routing", "step", "straight", "curved"]
related: ["edge-sequence", "edge-conditional", "edge-default"]
---
Each edge kind has a default pattern: Always is solid, Match text dashed and Fallback dotted. You can restyle any edge; styles are for display only and never change what runs, or a release's diff.

## How do I…
- Select an edge and use the inspector's **Style** group, or right-click it ▸ **Style**. **Reset style** goes back to the defaults.
- Pick a **Routing**: Curved (the default), Step (right angles) or Straight.
- Set the line new edges get in the palette, under **New edges**: a routing and a pattern ("By kind" keeps each kind's default).

A running edge stays animated, a failed one stays red, and a validation problem keeps its color, whatever the style.
