# Agent sovereignty: HyperNatt provides context, your agent decides

Native depth: `get_native_depth` (0.001 USDC). [Guide](native-depth.md).
Read-only liquidation and execution context for agents that trade on **their own**
Hyperliquid account.

**Not trade advice. No custody. No vault deposit required.**

MCP v2.10.0 — **5 tools:** [complete catalog](reference.md#mcp-tools-canonical).

---

## The idea

| Role | Who | What |
|------|-----|------|
| **Inform** | HyperNatt Terminal (this MCP) | Radar, execution estimates, snapshot comparison, fill reconciliation and optional swap playbook |
| **Decide** | Your agent / operator | Whether, when and how much to trade |
| **Execute** | **Your** HL agent wallet + any exec MCP/SDK you trust | place / cancel / close on **your** account |
| **Funds** | Your main HL wallet | USDC stays with you |

```
[Hermes / OpenClaw / Claude / NOFX-style agent]
        |
        +-- MCP: hypernatt-terminal  --> radar / quote / compare / reconcile
        |
        +-- MCP/SDK: Hyperliquid exec --> YOUR agent wallet orders
```

---

## Why this matters (sovereignty)

1. You keep risk, keys, and PnL.
2. You choose the relevant data tools; each costs 0.001 USDC or one eligible credit after its available trial.
3. You can swap the exec layer without changing HyperNatt.
4. You never send HyperNatt your HL main private key.

Never use a third-party vault address as a signing / `fromAddress` wallet.

---

## Hermes: two MCP servers (copy-paste)

`~/.hermes/config.yaml` — HyperNatt verified; HL exec is **your choice**.

```yaml
mcp_servers:
  hypernatt-terminal:
    url: https://hypernatt.com/mcp/protocol
    transport: streamable-http
  # Replace with YOUR Hyperliquid execution MCP (agent-wallet capable).
  # hyperliquid-exec:
  #   command: "uvx"
  #   args: ["hyperliquid-mcp"]
  #   env:
  #     HL_ACCOUNT_ADDRESS: "0xYourMain"
  #     HL_AGENT_KEY: "..."   # API wallet only — never main seed
```

Restart Hermes after edit. Enable MCP toolset (`native-mcp` skill if needed).

---

## Suggested agent loop

1. `get_agent_manifest` (free)
2. Optional `get_liq_radar` for liquidation terrain (BTC ETH SOL BNB XRP HYPE ZEC).
3. `get_native_depth` for a BTC or ETH size (`symbol`, `side`, `quantity_base`).
4. **Your** HL execution tools place/cancel orders.
5. Independently, use `swap_via_nattswap` when bridging/funding is needed; you sign. [Native depth](native-depth.md).

**Runnable read-only demo (no orders):**
[../examples/hyperliquid/read_terrain.py](../examples/hyperliquid/read_terrain.py)

```bash
python examples/hyperliquid/read_terrain.py
```

---

## OpenClaw / Claude / Cursor

1. Add connector: `https://hypernatt.com/mcp/protocol`
2. Separately configure your HL trading tools / agent wallet
3. Prompt example:

> Use HyperNatt get_liq_radar for BTC (or ETH/SOL/…) microstructure context.
> Do not deposit into any vault. If you trade, use MY Hyperliquid agent wallet tools only.
> Read-only context — not trade advice.

---

## Security checklist

- [ ] HL **agent/API wallet** for bots (trade yes, withdraw no)
- [ ] Main seed **offline**
- [ ] HyperNatt = context only (INV: no orders)
- [ ] Review any third-party exec MCP before pasting keys
- [ ] x402 USDC pays HyperNatt API calls — not HL margin

---

## Links

- MCP: `https://hypernatt.com/mcp/protocol`
- Manifest: `GET https://hypernatt.com/api/m2m/agent/manifest`
- Integrations: [integrations.md](integrations.md)
- Liq loop: [agent-liq-radar-loop.md](agent-liq-radar-loop.md)
- Platform: [https://hypernatt.com](https://hypernatt.com)
