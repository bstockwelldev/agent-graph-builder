---
"@bstockwelldev/agent-graph-sdk": minor
---

Agents are runnable. `agents.run(agentId, { input, provider?, model?, apiKey? })` starts a run of the agent's graph with its LLM profile, system prompt/instructions and tool allow-list applied. `AgentProfile` is now `graph_id` (required), `llm_profile_id`, `system_prompt_id`, `system_instructions` and `tool_ids`; the old `default_flow_id` and `optional_elements` are gone (stored agents read in the new shape). Run summaries and chat run refs carry `agent_id` (chat refs also `agent_name`).
