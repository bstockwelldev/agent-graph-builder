---
"@bstockwelldev/agent-graph-sdk": minor
---

`analytics.dashboard()` returns runs by status (`by_status`, and per day on `daily[].by_status`), a run duration distribution (`latency`, fixed buckets) and the provider/model mix (`by_model`). The fields are optional, so older servers still parse. New types: `AnalyticsLatencyBucket`, `AnalyticsModelRow`.
