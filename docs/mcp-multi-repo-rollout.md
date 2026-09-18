> Copied verbatim from `micro-ui-agent-builder/docs/mcp-multi-repo-rollout.md`
> (studio-consolidation Phase 6) — referenced by `tabletop-studio` and
> `board-game-sim-ai`, so it's kept here unaltered ahead of that repo's
> archival. Content below describes MUI's original orchestration role;
> AGB's `backend/app/mcp/` is the actual MCP client that superseded it.

# MCP multi-repo rollout, flags, and operations

Cross-repo plan for **tabletop-studio** (registry + RLS), **micro-ui-agent-builder** (orchestration), and **board-game-sim-ai** (consumer). Canonical tool identity: `serverId.toolName`.

## Feature flags

| Repo | Variable | Effect |
|------|----------|--------|
| micro-ui-agent-builder | `MCP_TOOL_RESOLUTION_ENABLED` | When not `false`, merges MCP tools into agent runs. |
| micro-ui-agent-builder | `MCP_REGISTRY_FROM_SUPABASE` | When `true`, merges `agent_builder.flow_mcp_links` with flow doc (requires Supabase + service role). |
| board-game-sim-ai | `BOARD_GAME_MCP_PHASE_A` | Enables import + post-run MCP enrichment. |
| board-game-sim-ai | `MCP_HTTP_BASE_URL` | HTTP MCP endpoint for consumer adapter. |

## Phased milestones

1. **Contract**: Supabase schema + RLS for `agent_builder.mcp_*` (see tabletop-studio `docs/architecture/mcp-registry-schema.md`).
2. **Single MCP**: One HTTP server, one flow, end-to-end in micro-ui-agent-builder.
3. **Multi-server**: Namespaced merge, health, degraded mode.
4. **Consumer**: board-game-sim-ai Phase A behind `BOARD_GAME_MCP_PHASE_A`.
5. **Phase B** (optional): Simulation-time MCP with timeouts/cache/fallback (documented in board-game-sim-ai `docs/architecture/mcp-consumer-phases.md`).

## Operational SLOs / metrics (targets)

Use these as gates before widening MCP usage or raising traffic.

| Metric | Target / alert |
|--------|----------------|
| MCP tool resolution latency (p95) | &lt; 2s warm; alert &gt; 5s |
| Tool call failure rate | &lt; 1% excluding client timeouts; alert &gt; 5% |
| Unhealthy server ratio | Degrade gracefully; alert if &gt; 50% servers unhealthy for 15m |
| Import enrichment timeout rate | Log-only; should not block import if MCP fails |
| Post-run MCP timeout rate | Log-only; summary still generated without MCP block |

**Dashboards**: expose counters/histograms for resolution time, `tools/call` errors, and health probe status from the agent-builder runtime and any cron health jobs.

## Runbooks (short)

- **All MCP tools missing for a flow**: Check `flow_mcp_links` + `mcp_servers.enabled`; verify `MCP_REGISTRY_FROM_SUPABASE` and service role in agent-builder.
- **Consumer sees no enrichment**: Verify `BOARD_GAME_MCP_PHASE_A=true`, `MCP_HTTP_BASE_URL`, and tool name env vars; check server logs for `[mcp-consumer]`.
- **Secret leakage concern**: Ensure DB stores **refs** only; resolve secrets server-side in agent-builder, not in browser payloads.

## Related docs

- Tabletop Studio: `docs/architecture/mcp-registry-schema.md`
- Board Game Sim AI: `docs/architecture/mcp-consumer-phases.md`
