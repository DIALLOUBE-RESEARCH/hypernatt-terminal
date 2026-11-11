# `get_agent_manifest`

**Start here.** Free compact catalog (tools, prices, cluster `do_not`, honest usage). Pass `detail=full` for quota/pass/onboarding.

## Price

**Free**

## Live MCP surface (5 tools)

| Tool | Role | Price |
|------|------|-------|
| `get_agent_manifest` | Catalog, value prop, scenarios, glossary | Free |
| `get_liq_radar` | Forced-order / liquidation map (BTC ETH SOL BNB XRP HYPE ZEC) | 1 credit / $0.001 x402 |
| `swap_via_nattswap` | Li.Fi quote + execution playbook | Free at MCP layer |
| `get_native_depth` | Recorded liquidity, wall history and aggressor flow for a BTC or ETH size | 1 credit / $0.001 x402 |

Choose `journeys_v1` by intent: radar for liquidation terrain; native depth for filmed BTC/ETH size feasibility; swap for a Li.Fi route. Compact and full include the same actionable journey.

## Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `locale` | string | No | Not a translation switch. Ignored. English only. |
| `detail` | string | No | Default `compact`. `full` = quota/pass/onboarding. |

## Outputs

The default **compact** response contains `terminal`, `description`, the four-entry `tools[]`, `journeys_v1`, `trial_policy_v2` and `pricing`. Radar-specific guidance is in `value_proposition_v1`, `use_scenarios_v1` and `glossary_v1`.

With **`detail=full`**, read `sections[]`, `onboarding`, `pass_program`, `quota_program` and radar guidance in `agent_interpretation_rules_v1`. Both forms include `journeys_v1`. Client-specific `free_tier_status_v1` requires the same MCP client identity; anonymous REST discovery is not that client's remaining allowance. Usage counters are optional.

## Example — MCP

```http
POST https://hypernatt.com/mcp/protocol
Content-Type: application/json
Accept: application/json, text/event-stream

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_agent_manifest",
    "arguments": {}
  }
}
```

## Example — REST

```bash
curl -sS "https://hypernatt.com/api/m2m/agent/manifest"
```

## Notes

Call this before any paid tool. No x402 required.
Optional Agent Pass: **$5 for 15,000 credits valid for 30 days**; one credit covers either paid tool. Read `detail=full` for the current program. [Payment guide](../docs/x402-pay.md).

Native depth: [native-depth.md](../docs/native-depth.md).
