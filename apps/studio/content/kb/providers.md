---
id: providers
title: "Model providers"
summary: "Which model a run uses, and what each provider needs"
category: concept
keywords: ["provider", "providers", "model", "stub", "groq", "gemini", "google", "azure", "openai", "ollama", "api key", "offline"]
related: ["node-llm", "resource-llm-profiles", "runs-and-traces"]
---
The provider is chosen per run in the Run panel. **Stub** is an offline, deterministic stand-in that needs no key; it's the default and what the demo uses.

- **Stub:** nothing.
- **Groq:** `GROQ_API_KEY` on the server.
- **Google Gemini:** `GOOGLE_API_KEY` on the server.
- **Azure OpenAI:** an Azure endpoint, key and deployment on the server.
- **Ollama:** Ollama running where the API runs.
- **OpenAI-compatible:** a base URL, key and default model.

The Run panel's provider and model apply to every LLM node in that run. An LLM node's own model is its default.
