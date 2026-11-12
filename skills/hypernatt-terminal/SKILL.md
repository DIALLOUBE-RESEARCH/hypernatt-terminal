---
name: hypernatt-terminal
description: >-
  Onboarding skill for HyperNatt Terminal remote MCP (exactly 5 tools v2.10.0):
  get_agent_manifest, get_liq_radar, swap_via_nattswap, get_native_depth.
  Docs + call order only - no local exec/shell/files. Read-only market
  microstructure for crypto trading agents. Liquidation radar (7 tokens) and
  recorded liquidity, wall history and aggressor flow (BTC ETH). Not trade advice. Two data tools
  cost $0.001 USDC/call or one eligible credit after an available daily MCP
  trial. Manifest and MCP swap requests are free.
version: 1.7.0
author: DIALLOUBE-RESEARCH
license: MIT
homepage: https://hypernatt.com
permissions:
  exec: false
  filesystem: false
  network:
    - hypernatt.com
    - docs.cdp.coinbase.com
  env: []
  tools:
    - mcp
metadata:
  openclaw:
    requires:
      bins: []
    envVars: []
    primaryEnv: null
  hermes:
    tags:
      [
        MCP,
        x402,
        crypto,
        trading,
        perpetual,
        liquidation,
        microstructure,
        market-data,
        swap,
      ]
    related_skills: [native-mcp, mcporter, hypernatt-liq-radar]
---

# HyperNatt Terminal MCP

**What this skill is:** onboarding text for a **remote** MCP server.

**What this skill is NOT:** a local bot, vault control, or a 14-tool terminal.
Live surface = **exactly 5 tools - v2.10.0**.

## Declared capabilities (honest)

| Capability | Declared |
|------------|----------|
| Local exec / shell | **No** |
| Local filesystem | **No** |
| Env vars required | **None** |
| Outbound network | `https://hypernatt.com` ; optional Coinbase Agentic Wallet docs |
| Tools | Remote MCP connector only |

## Connect

| Resource | URL |
|----------|-----|
| Platform | https://hypernatt.com |
| MCP | https://hypernatt.com/mcp/protocol |
| Server card | https://hypernatt.com/.well-known/mcp/server-card.json |
| Source | https://github.com/DIALLOUBE-RESEARCH/hypernatt-terminal |
| Security | https://github.com/DIALLOUBE-RESEARCH/hypernatt-terminal/blob/main/SECURITY.md |
| Trading-first skill | https://github.com/DIALLOUBE-RESEARCH/hypernatt-terminal/blob/main/skills/hypernatt-liq-radar/SKILL.md |

## Tool surface (4 only)

1. **get_agent_manifest** - Free - Catalog + journeys
2. **get_liq_radar** - $0.001 x402 - Forced-order / liquidation map (7 tokens)
3. **swap_via_nattswap** - Free at MCP (you sign) - Li.Fi route
4. **get_native_depth** - $0.001 - Recorded liquidity, wall history and aggressor flow for a BTC or ETH size

Radar symbols: BTC ETH SOL BNB XRP HYPE ZEC (omit = BTC). Native depth: BTC ETH only. Li.Fi swaps use supported chain/token addresses independently of these lists.

Daily MCP trial: one free call per paid tool and eligible token each UTC day: radar x 7 plus native BTC/ETH, up to 9 independent trials; then 0.001 USDC per call. Read trial_policy_v2 and free_tier_status_v1 on the same MCP connection. A zero daily_cap is the separate credit pool, not the intro allowance.

## Example

Use the connected remote MCP tool interface (no shell command):

```json
{"name":"get_agent_manifest","arguments":{}}
```

Then, if liquidation terrain is the requested task:

```json
{"name":"get_liq_radar","arguments":{"symbol":"ETH"}}
```

## Native-depth workflow

For a BTC or ETH size, call `get_native_depth` with `symbol`, `side`, `quantity_base`. Optional `lookback_s` is 30 or 300. This compares four simultaneous recorded liquidity views and their history. `not_a_signal` is always true. See [native-depth.md](../../docs/native-depth.md).

## Trading-agent loop

1. Connect and call `get_agent_manifest` (free); choose `journeys_v1` by intent.
2. For liquidation terrain, use `get_liq_radar`. For filmed BTC/ETH size feasibility, use `get_native_depth`. Neither path requires buying the other.
3. Read `agent_readout`, `liquidity_map.views` and `trade_flow`. Compare fixed-price wall changes and observed aggressor flow with radar terrain. Check coverage and freshness; never sum overlapping views or infer a strategy signal.
4. Use `swap_via_nattswap` separately for a Li.Fi route. You sign your own transaction. No mandatory paid polling.

## Wallet / x402

After an available daily trial, the two data tools cost 0.001 USDC per call or one eligible credit. Optional Agent Pass and swap-earned credits cover both; read `pass_program` and `quota_program` with `get_agent_manifest({"detail":"full"})`. These fields are absent from the compact response.

For x402 payment, use a USDC buyer wallet. **Base** = EIP-3009 (`@x402/evm`). **Solana** = SVM exact (`@x402/svm`); an EVM signer cannot pay it. Inspect the MCP tool content for `accepts[]` and `isError`, even under HTTP 200; then retry with `x_payment` using an offered rail. See [payment and credits](../../docs/x402-pay.md). Use the buyer wallet already configured in the host application and its payment authorization rules. If no wallet is configured, explain the available free trials and let the user choose whether to set up payments separately.

Optional wallet setup documentation for the user: https://docs.cdp.coinbase.com/agentic-wallet/mcp/welcome

This remote-only onboarding skill does not install or launch local software, create wallets, or change the host configuration.

This skill never asks for private keys or scrapes env secrets.

## Honest claims

- Not trade advice - no custody - no performance promise
- Do not advertise more than 5 MCP tools
- Vault/platform pages are not Terminal MCP P&L
