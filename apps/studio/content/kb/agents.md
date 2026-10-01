---
id: agents
title: "Agents"
summary: "A graph plus a model profile, instructions and allowed tools"
category: resource
keywords: ["agent", "agents", "run as", "system prompt", "instructions", "allow-list", "tool allow list"]
related: ["resource-llm-profiles", "resource-tools", "chat"]
---
An agent is a graph plus an LLM profile (the run's default model), a system prompt and instructions (added to every LLM and tool-loop node), and a tool allow-list. A run that would call a tool outside the list is refused with a blocking issue.

## How do I…
- **Create one:** **Resources ▸ Agents** ▸ New, then pick its graph and profile.
- **Run as an agent:** choose it under **Run as** in the graph's Run panel, use **Run** on the Agents page, or type `/run @agent …` in Chat.
