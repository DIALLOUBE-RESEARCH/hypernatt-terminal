# x402 payment — Base vs Solana

Two MCP tools cost **0.001 USDC per call** on **two rails**: `get_liq_radar` and `get_native_depth`. Pick one supported entry from the returned `accepts[]`; do not mix networks or signing formats.

## Trials and credits

- **Daily MCP trial:** one free call per paid tool, eligible token and client each UTC day: radar x 7 tokens plus native BTC/ETH = up to 9 independent slots. Read `trial_policy_v2` and `free_tier_status_v1` through the same MCP connection. The daily credit pool and intro slots are separate.
- **Eligible credits:** one credit per call for each paid tool. Pass credits and swap-earned credits are associated with an EVM wallet; pass that address as `agent_wallet`. This is separate from the choice of Base or Solana for an x402 payment.
- **Agent Pass:** the full manifest currently advertises $5 for 15,000 credits valid for 30 days. Swap-earned credits depend on eligible completed swaps and registration. Neither option is required for pay-per-call use.
- **Free MCP tools:** `get_agent_manifest` and `swap_via_nattswap`. Signing a swap still incurs the route's on-chain costs; API payment does not pay swap gas or trading fees.

Call `get_agent_manifest` with `{"detail":"full"}`, or GET `/api/m2m/agent/manifest?detail=full`, for `pass_program` and `quota_program`. The default compact catalog omits those blocks.

## MCP payment response versus HTTP 402

On MCP, call the intended tool without `x_payment` first. If a trial or eligible credit covers it, no x402 payment is needed. Otherwise, payment requirements arrive in the tool result (`isError: true`, JSON text with `accepts[]`); the HTTP transport can still return 200. An x402-capable client must inspect that result, obtain the authorized payment and retry the same tool with `x_payment` (base64 JSON).

Direct REST calls to `/api/m2m/liq-radar`, `/api/m2m/swap/quote` and `/api/m2m/native-depth/quote` return HTTP 402 when unpaid and without eligible access; they do not provide the MCP intro slots. Retry REST with `X-Payment` or `PAYMENT-SIGNATURE`. Native depth over REST takes a JSON body on POST, or the same fields as URL parameters on GET (`?symbol=ETH&side=buy&quantity_base=0.1&lookback_s=300`); invalid input answers 400 before any settlement. A connector or wallet installation alone does not guarantee automatic payment support in every client.

**Historical `get_liq_radar` Solana payment receipts (REST and MCP):**
- **REST settle:** [36FvuTpq...](https://solscan.io/tx/36FvuTpqWiSoDLrs2xVRecehCmArdqptDXB8sHTfvJQSUCs7GY7CLhHwGHYwT4eXqqcgkroYheFcy5ajrUgdJLSg) (2026-09-05 UTC, slot 444415694)
- **MCP Streamable HTTP (`x_payment`) settle:** [5g4JePDX...](https://solscan.io/tx/5g4JePDXuqwViz7noAiPhXJTQmQNUAdYifLM417uMt79q5Y3LkL8KDW1rUB1aX8EbfagU2AXPXQvSQtgStqjAi11) (2026-09-05 UTC, slot 444416162)
- Historic first settle: [42WDNoZ9...](https://solscan.io/tx/42WDNoZ9sLdrHnSBYeSr9ZDLiLJpzwx2kgR6WWYSFsXQMm1AbvhBLrzMkwi22BzagLteKoWN3gDr9Skf1UVBaDi5) (2026-08-29 UTC).

A Base HTTP 200 is **not** a Solana payment.

| Rail | `network` in 402 | What the buyer signs |
|------|------------------|----------------------|
| **Base** | `eip155:8453` | EIP-3009 authorization (EVM). `@x402/evm` / typical Node x402 fetch clients. |
| **Solana** | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | Partially signed SPL `TransferChecked`. **`@x402/svm` (or equivalent).** |

## Solana is not "Base with another chain id"

An EVM x402 client that works on Base **cannot** pay Solana. SVM `exact` requires:

1. **Single `TransferChecked` instruction**: client partially signs a transfer of SPL USDC from their associated token account (ATA) to the seller treasury.
2. `feePayer` = `extra.feePayer` from **this** 402 (CDP sponsors gas — not your pubkey).
3. Amount **strictly atomic `1000`** ($0.001 USDC, 6 decimals). (Human-readable `"0.001"` is accepted via backward-compatible coercion, but atomic integer string is standard).
4. USDC mint = `accepts[].asset` (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`). Put the same value on the payment payload as `accepted.asset` (CDP v2).
5. Destination = `accepts[].payTo` (HyperNatt Solana treasury: `2hAXt3sb2GZrtXx4ae4Ywc7enqrE191nktyL5k2nWSfg`).
6. Network format: CAIP-2 (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`) or legacy v1 alias (`solana`, `solana-mainnet`) accepted and auto-mapped.
7. **Immediate signature**: Solana payments embed a recent blockhash (~90 seconds lifespan). Sign and transmit in the same execution cycle. Stale blockhashes fail `BlockhashNotFound`.

If you only have an EVM wallet (or no `@x402/svm`), select the entry whose `network` is `eip155:8453` (Base). Do not select by array position. Do not retry Base after a Solana sign failure and call that a Solana payment.

If CDP returns `invalid_exact_svm_*`, `preflight_validation_failed`, `x402V2PaymentRequirements requires 'asset'`, or `invalid_network`, the **payload** is wrong — not the 402 challenge. Rebuild with `@x402/svm` against the live 402. Keep `accepted.network` starting with `solana`.

## Probe

```bash
curl -i https://hypernatt.com/api/m2m/liq-radar
curl -i "https://hypernatt.com/api/m2m/native-depth/quote?symbol=ETH&side=buy&quantity_base=0.1"
```

Read `accepts[]`. Pay one rail. Retry with `X-Payment` **or** `PAYMENT-SIGNATURE` (base64 JSON payload).

Public MCP: `https://hypernatt.com/mcp/protocol` — start with `get_agent_manifest`, choose the tool for your task, and follow its returned payment requirements. Supply `x_payment` only when payment is needed.
