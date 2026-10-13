---
"@bstockwelldev/agent-graph-sdk": patch
---

`chatSessions.send` accepts an optional `apiKey`: a bring-your-own key for the chat session, forwarded as `api_key` so live providers work where the server won't spend its own key (public demo mode). The key is sent per message and never persisted.
