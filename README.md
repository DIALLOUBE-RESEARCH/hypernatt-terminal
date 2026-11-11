# HyperNatt Terminal

[![CI](https://github.com/DIALLOUBERESEARCH/hypernatt-terminal/actions/workflows/ci.yml/badge.svg)](https://github.com/DIALLOUBERESEARCH/hypernatt-terminal/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/DIALLOUBERESEARCH/hypernatt-terminal/badges/score.svg)](https://glama.ai/mcp/servers/DIALLOUBERESEARCH/hypernatt-terminal)
[![x402-list](https://x402-list.com/badge/hypernatt-terminal.svg?data=uptime)](https://x402-list.com/services/hypernatt-terminal?utm_source=badge&utm_medium=referral&utm_campaign=embed)
[![Version](https://img.shields.io/badge/version-2.10.0-green)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](./LICENSE)
[Security notes](./SECURITY.md)

<p align="center">
  <sub>Research and development by</sub><br />
  <a href="https://github.com/DIALLOUBERESEARCH">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://hypernatt.com/brand/dialloube/logo-horizontal-blanc.svg" />
      <img src="https://hypernatt.com/brand/dialloube/logo-horizontal-bleu.svg" alt="DIALLOUBE-RESEARCH" height="18" />
    </picture>
  </a>
</p>

**Liquidation radar** (7 tokens) and **recorded liquidity, wall history and aggressor flow** (BTC and ETH) for AI agents + **Li.Fi** cross-chain swap. Pay-per-call via x402.

Understand **liquidation terrain**, then ask whether a BTC or ETH size is **feasible on the filmed book** (REF plus separate aggregated views and recorded history). For cross-chain swaps, request a **Li.Fi route** that your agent signs. Your agent chooses the task and controls execution.

Built by one person. Code is public. Backend is private. No custody. Not trade advice.

Full HyperNatt platform (vault, assistant): https://hypernatt.com — this repo is one agent-facing brick.

> Public runtime and docs are synced from the monorepo. Repository: https://github.com/DIALLOUBERESEARCH/hypernatt-terminal.

## Quick start (30 seconds)

No install for the hosted MCP. In **Claude → Settings → Connectors → Add custom connector**:

| Field | Value |
|-------|-------|
| Name | HyperNatt Terminal |
| URL | `https://hypernatt.com/mcp/protocol` |

Then ask:

> Call get_agent_manifest and choose journeys_v1 for my task. Use get_liq_radar for liquidation terrain. For an ETH buy of 0.1 ETH, walk filmed recorded liquidity context with get_native_depth. Use swap_via_nattswap for a Li.Fi route.

More clients (Cursor / Cline / Codex / Windsurf): [docs/integrations.md](docs/integrations.md).

## What HyperNatt Terminal gives your agent

Start with **`get_agent_manifest`** (free), then choose the tools your task needs through `journeys_v1`:

- **Understand the market:** `get_liq_radar` provides liquidation clusters, open-interest context and observed liquidations (BTC ETH SOL BNB XRP HYPE ZEC).
- **Walk filmed depth:** `get_native_depth` reports fill, remaining and four simultaneous views, fixed-price wall history and observed aggressor flow.
- **Find a cross-chain swap route:** `swap_via_nattswap` requests a Li.Fi route for your source/destination chains and tokens. Your agent signs the transaction.

Radar covers **seven** tokens. Native depth is **BTC and ETH only**. Cross-chain swaps use the chains and tokens supported by Li.Fi, subject to route availability. Neither paid tool requires the other.

## Liquidation terrain — `get_liq_radar`

A map of **forced orders**: where leveraged positions will be liquidated if price reaches them (clusters, OI build-up, observed liquidations).

This is **market structure context**, not a trade signal. It shows terrain so a sovereign trading agent can judge timing, sizing, and risk with more awareness than agents that only read RSI/MACD-style public feeds.

Your agent still decides. We show the terrain.

### Radar scenarios

#### Scenario 1 — Ignore noise; wait only near class=true

Ignore clusters with `class=noise` (distance < 3%). If `cluster_grammar` is present, wait only near `class=true` (low-leverage stack ~7%+). Then watch `real_liquidations` print — **without** assuming a guaranteed reversal. `class=true` is terrain, not an entry signal.

#### Scenario 2 — Size relative to distance

Cluster ~5% away vs ~0.5% away is a different risk parameter. Distance informs sizing or patience — it is **not** a prediction that the level will be hit.

#### Scenario 3 — After real liquidations, check OI

If price swept a zone and real liquidations spiked, compare with OI change. A large OI drop can mean forced flow is partly exhausted — still context, **not** an auto entry.

### Radar glossary

| Term | Meaning |
|------|---------|
| Cluster | Zone where leveraged positions may liquidate if mark reaches it. Not a TP. |
| `cluster_grammar` / `class` | If present: **read this first**. `noise` = distance < 3% (ignore); `true` = ~7%+ (low-leverage stack). Not a trade signal. |
| Nearest vs largest | `nearest_*` is a legacy alias of `largest_*` (size leader), not closest-to-mark. |
| Real vs estimated | `real_liquidations` = observed; `liq_density` clusters = modeled. Both labeled. |
| `magnet.score` | Directional density bias from OI / L-S / funding. **Not** a hit probability. |

The radar glossary and scenarios also ship on `get_agent_manifest` → `agent_interpretation_rules_v1`. Use `journeys_v1` for native-depth and swap workflows.

## Native REF depth — `get_native_depth`

**“Where is liquidity, is it changing, and what flow is meeting it?”** Supply `symbol` (`BTC` or `ETH`), `side`, `quantity_base`, and `lookback_s` (30 or 300). Read `agent_readout`, then `liquidity_map` for four simultaneous price granularities, size coverage and changes at fixed wall prices; `trade_flow` shows observed aggressor buying/selling. Check history coverage and freshness. Never sum overlapping views. These facts complement radar terrain without disclosing a strategy or guaranteeing a fill. [Guide](docs/native-depth.md).

## Cross-chain swaps — `swap_via_nattswap`

**“What route is available to swap my token on one chain for a token on another?”** Supply the source/destination chains and tokens, amount and wallet addresses. Review the Li.Fi route, costs and execution readiness; your agent signs with its own wallet. This is a separate workflow from native BTC/ETH depth. [Swap inputs and execution steps](tools/swap_via_nattswap.md).

## Trial and pricing

Daily MCP trial: one free call per paid tool and eligible token each UTC day: radar x 7 tokens plus native BTC/ETH, up to 9 independent trials; then 0.001 USDC per call. Read trial_policy_v2 and free_tier_status_v1 on the same MCP connection for current availability. A zero daily_cap is the separate credit pool, not the intro allowance.

## What you get

| Tool | Price |
|------|-------|
| `get_agent_manifest` | Free — call first |
| `get_liq_radar` | **$0.001** x402 (Base EIP-3009 **or** Solana SVM exact) |
| `swap_via_nattswap` | Free at MCP (you sign; gas + Li.Fi fee on-chain) |
| `get_native_depth` | **$0.001** x402, or eligible credits |

**Solana pay:** rail is **live** (SVM exact). Do **not** reuse an EVM/Base x402 client. Use `@x402/svm`. A Base HTTP 200 is not a Solana payment. See [docs/x402-pay.md](docs/x402-pay.md).

Whitelist `get_liq_radar`: **BTC ETH SOL BNB XRP HYPE ZEC** (omit `symbol` = BTC). `get_native_depth`: **BTC ETH only**.

### What we do NOT claim

| We do **not** claim | What we **do** show |
|---------------------|---------------------|
| Generic Coinglass wrapper | Operator-shaped forced-order map for agents |
| Predictive Fuel Score / sweep classifier | Distance, size, OI, real liqs — labeled |
| Custody of keys or funds | Agent signs own txs |
| Trade advice / guaranteed edge | Read-only JSON context |
| More than 5 MCP tools | **Exactly 5** · v2.10.0 |
| Vault / `/stats` = Terminal P&L | Separate HyperNatt vault product |
| Independent security audit | Public code + [SECURITY.md](./SECURITY.md) |

## Try it

```bash
curl -s https://hypernatt.com/api/m2m/agent/manifest
curl -i https://hypernatt.com/api/m2m/liq-radar
```

| Step | Link |
|------|------|
| Quickstart | [docs/quickstart.md](docs/quickstart.md) |
| **x402 Base vs Solana** | [docs/x402-pay.md](docs/x402-pay.md) |
| Integrations (5 clients + AgentKit) | [docs/integrations.md](docs/integrations.md) |
| HL terrain example (read-only) | [examples/hyperliquid/read_terrain.py](examples/hyperliquid/read_terrain.py) |
| Honest interpret example | [examples/liq_radar_interpret.py](examples/liq_radar_interpret.py) |
| CDP Bazaar checklist | [docs/cdp-bazaar-checklist.md](docs/cdp-bazaar-checklist.md) |
| Examples | [examples/](examples/) |
| Security | [SECURITY.md](SECURITY.md) |
| Buyer skill (use the MCP) | [skills/hypernatt-terminal/SKILL.md](skills/hypernatt-terminal/SKILL.md) |
| Tests | [test/](test/) — `npm test` |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

MCP: https://hypernatt.com/mcp/protocol

### For non-crypto users (x402 wallet)

You can start with the daily MCP trials without setting up payments. For paid use, one optional wallet provider is **Coinbase Agentic Wallet MCP**. Follow its current setup and funding instructions; available funding methods depend on the provider and your account:

```bash
npx @coinbase/payments-mcp
```

Docs: [Agentic Wallet MCP](https://docs.cdp.coinbase.com/agentic-wallet/mcp/welcome). Then connect HyperNatt Terminal (`https://hypernatt.com/mcp/protocol`). The two paid tools — `get_liq_radar` and `get_native_depth` — each cost **0.001 USDC per call**, or one eligible credit, after an available daily trial. An x402-capable client can handle the payment requirements and retry under your payment authorization rules. In MCP, inspect the tool response for payment requirements; do not rely only on an HTTP 402 status. See [payment and credits](docs/x402-pay.md).

Optional: eligible swap-earned credits or an **Agent Pass at $5 for 15,000 credits valid for 30 days**, shared across the paid tools. Call `get_agent_manifest` with `{"detail":"full"}` to read the current `pass_program` and `quota_program`; they are not included in the default compact response. Manifest and MCP swap requests remain free; on-chain swap costs are separate.

## License

MIT — see [LICENSE](LICENSE).
