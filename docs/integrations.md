# HyperNatt Terminal — Integrations

How to connect liquidation radar, native BTC/ETH REF depth and a Li.Fi swap playbook to your agent. No custody. Your agent controls execution.

**MCP v2.10.0 — 5 tools:** `get_agent_manifest`, `get_liq_radar`, `swap_via_nattswap`, `get_native_depth`.

[`get_native_depth`](native-depth.md) uses MCP (and HTTP `/api/m2m/native-depth/quote`) and costs
**$0.001 USDC per call**, with the same credits and x402 rails as the radar.

Two ways in:
- **MCP:** `https://hypernatt.com/mcp/protocol`
- **REST + x402:** radar, native-depth and swap-quote discovery endpoints below.

**Trading your own Hyperliquid account?** Pair this MCP with **your** HL
agent-wallet exec tools — no vault deposit. Guide:
[agent-hl-sovereignty.md](agent-hl-sovereignty.md).

Verification labels below refer to the documented connector configuration or endpoint. They do not establish end-to-end payment support in every client or version. **[reference]** sections point to the framework's own docs.

---

## 1. Any MCP client — Claude / Cursor / Windsurf  [verified]

| Field | Value |
|-------|-------|
| MCP URL | `https://hypernatt.com/mcp/protocol` |
| SSE | `https://hypernatt.com/mcp/sse` |
| Server card | `https://hypernatt.com/.well-known/mcp/server-card.json` |
| Smithery | `npx -y @smithery/cli@latest mcp add hypernatt/hypernatt-terminal` |

### Clients (same URL everywhere)

| Client | Config |
|--------|--------|
| Claude Desktop | Settings → Connectors → Add custom connector → URL above |
| Cursor | MCP Streamable HTTP → URL above |
| Cline | MCP server settings → Streamable HTTP → URL above |
| Codex | `mcp_servers` / CLI → URL above |
| Windsurf | MCP config → URL above |

README 30s block: [../README.md](../README.md#quick-start-30-seconds).

Example prompt:

> Call get_agent_manifest and choose journeys_v1 for my task: liquidation terrain, costs for my Hyperliquid order size, changes since a saved check, reconciliation of my fills, or a Li.Fi swap route. Call only the relevant tools.

`get_agent_manifest` and MCP `swap_via_nattswap` are free. Radar and native depth cost **0.001 USDC or one eligible credit** after an available daily trial. [MCP payment errors, shared credits and trials](x402-pay.md).

---

## 2. Zero-setup REST — no wallet  [verified]

```bash
# Catalog (6 MCP tools, prices) — free:
curl -s https://hypernatt.com/api/m2m/agent/manifest

# Public REST radar — HTTP 402 discovery; use MCP for the daily per-token intro:
curl -s "https://hypernatt.com/api/m2m/liq-radar?symbol=BTC"
```

Direct unpaid REST discovery returns **HTTP 402**; MCP intro slots do not apply to these REST probes.
Pay **$0.001 USDC on Base or Solana** and retry with `X-Payment` (or pass
`agent_wallet` for swap-earned quota).

**Swaps:** prefer MCP `swap_via_nattswap` (free at API layer). Full guide:
[swap-agentkit.md](swap-agentkit.md). Use **your** agent signing wallet as
`fromAddress` — never a third-party vault address.

Optional HTTP-only (not an MCP tool): `GET /api/m2m/swap/quote` — raw Li.Fi JSON.

---

## 3. Coinbase AgentKit / x402 buyer (liq-radar)  [endpoint verified · SDK reference]

HyperNatt endpoints speak x402 natively (402 → pay → retry). An x402-capable
client can pay $0.001 USDC on its supported rail and retry under the operator's spending authorization — no Terminal API key.

**Buyer path (forced-order map):**

```text
1. GET https://hypernatt.com/api/m2m/liq-radar?symbol=BTC
2. If HTTP 200 → read JSON terrain (clusters / OI / real_liquidations)
3. If HTTP 402 → build x402 payment from response, retry with header X-PAYMENT
4. Do NOT invent a BUY/SELL — agent decides from terrain
```

```bash
# Unpaid REST discovery probe (no MCP intro):
curl -i "https://hypernatt.com/api/m2m/liq-radar?symbol=BTC"
```

- **Verified (our side):** unpaid `GET /api/m2m/liq-radar` returns HTTP 402 and
  accepts the `X-Payment` retry.
- **Reference (SDK side):** wire AgentKit / CDP x402 buyer to that endpoint —
  [Coinbase AgentKit](https://docs.cdp.coinbase.com/agentkit/docs/welcome) ·
  [x402](https://docs.cdp.coinbase.com/x402/welcome) ·
  optional wallet MCP: `npx @coinbase/payments-mcp`
- **Swaps:** x402 pays paid **reads** only. Signing Li.Fi needs your agent wallet —
  see [swap-agentkit.md](swap-agentkit.md).
- **Discovery listing (owner):** [cdp-bazaar-checklist.md](cdp-bazaar-checklist.md)

---

## 4. ElizaOS / GOAT and other agent frameworks  [reference]

- **Via MCP:** point the framework's MCP client at `https://hypernatt.com/mcp/protocol`.
- **Via REST:** call the endpoints in section 2; handle 402 with an x402 client.

See each framework's own docs for plugin wiring.

---

## 5. Hermes Agent (Nous Research)  [verified config · runtime reference]

```yaml
mcp_servers:
  hypernatt-terminal:
    url: https://hypernatt.com/mcp/protocol
    transport: streamable-http
```

**Sovereignty pattern (2 MCP):** keep HyperNatt for radar, execution estimates, comparisons, fill reconciliation and the swap playbook;
add a **separate** Hyperliquid execution MCP/SDK with **your** agent wallet — see
[agent-hl-sovereignty.md](agent-hl-sovereignty.md). HyperNatt never places HL orders.

Restart gateway or CLI after editing config. Enable MCP toolset (`native-mcp`).

Optional skill:

```bash
hermes skills install github/DIALLOUBE-RESEARCH/hypernatt-terminal/skills/hypernatt-terminal
```

Skill path: [../skills/hypernatt-terminal/SKILL.md](../skills/hypernatt-terminal/SKILL.md)

---

## Notes

- `get_liq_radar` is **read-only context, not a trade recommendation**.
- Radar and Hyperliquid execution context: BTC ETH SOL BNB XRP HYPE ZEC. Li.Fi routing has separate chain/token availability.
- Pricing: [quickstart.md](quickstart.md) · [reference.md](reference.md).
