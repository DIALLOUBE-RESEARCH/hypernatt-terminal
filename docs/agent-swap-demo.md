# Agent swap demo — wallet-first path

Native depth: `get_native_depth` (0.001 USDC). [Guide](native-depth.md).
Minimal recipe for builders who already pay HyperNatt x402 tools but have not executed a NattSwap yet.

**Read-only context is not trade advice. No custody.**

This guide covers the swap journey. MCP v2.10.0 has **5 tools**: [complete catalog](reference.md#mcp-tools-canonical).

---

## Prerequisites

| Requirement | Why |
|-------------|-----|
| **Agent hot wallet** | CDP Agentic Wallet, AgentKit, or viem `WalletClient` |
| Source token balance | Amount you intend to swap; API payment balance is separate |
| **Gas on source chain** | Ethereum/Arbitrum/etc. if bridging from there |
| **MCP client** | Claude, Cursor, or Hermes with `https://hypernatt.com/mcp/protocol` |

Optional: [Coinbase Payments MCP](https://www.coinbase.com/developer-platform/discover/launches/payments-mcp) so the agent has wallet + x402 in one UI.

---

## Step 0 — Check onboarding (no wallet)

```bash
curl -s 'https://hypernatt.com/api/m2m/agent/manifest?detail=full' | jq '.sections[] | select(.name=="Execution") | .wallet_onboarding_v1'
```

---

## Step 1 — Connect HyperNatt MCP

```json
{
  "mcpServers": {
    "hypernatt-terminal": {
      "url": "https://hypernatt.com/mcp/protocol",
      "transport": "streamable-http"
    }
  }
}
```

Smithery: `npx -y @smithery/cli@latest mcp add hypernatt/hypernatt-terminal`

---

## Step 2 — Optional liquidation context

Prompt your agent:

> If liquidation terrain is relevant, call `get_liq_radar` for my chosen supported token. Otherwise proceed directly to the swap route. Use my signing wallet for the swap.

Radar has its own daily tool/token trial and paid access. It is not a prerequisite for a free MCP swap request.

---

## Step 3 — Swap with YOUR wallet

Prompt (replace `0xYourAgentWallet`):

> Call `swap_via_nattswap` with:
> - fromChain: 8453 (Base)
> - toChain: 8453
> - fromToken: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC Base)
> - toToken: `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` (cbBTC Base) or USDC on another chain
> - fromAmount: `1000000` (1 USDC, 6 decimals)
> - fromAddress: **0xYourAgentWallet**
> - toAddress: **0xYourAgentWallet**
>
> If `execution_readiness.can_execute` is false, stop and fix blockers. If true, follow `swap_execution_playbook_v1` and sign with my wallet.

Cross-chain example (needs ETH gas on Ethereum):

> fromChain 1, toChain 8453, USDC→USDC, same wallet for from/to.

Full detail: [swap-agentkit.md](swap-agentkit.md)

---

## Step 4 — Register for quota (after on-chain success)

```bash
curl -X POST https://hypernatt.com/api/m2m/swap/register \
  -H "Content-Type: application/json" \
  -d '{
    "agentAddress": "0xYourAgentWallet",
    "txHash": "0x...",
    "fromChain": 8453
  }'
```

Check credits:

```bash
curl -s "https://hypernatt.com/api/m2m/quota/status?wallet=0xYourAgentWallet"
```

---

## Common failure (why quotes spike, swaps stay at zero)

| Mistake | Fix |
|---------|-----|
| `fromAddress` = third-party vault | Use agent wallet only |
| Paid HTTP quote reports payer/fromAddress mismatch | Follow the returned EVM payer rule; free MCP routing uses your actual swap signer |
| No ETH on Ethereum for ETH→Base bridge | Fund gas on source chain |
| Broadcast when `can_execute: false` | Read `blockers` first |

---

## Related

- [swap-agentkit.md](swap-agentkit.md)
- [integrations.md](integrations.md)
- [quickstart.md](quickstart.md)
