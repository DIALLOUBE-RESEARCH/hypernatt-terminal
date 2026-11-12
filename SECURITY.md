# Security & Trust — HyperNatt Terminal

Native depth: `get_native_depth` (0.001 USDC). [Guide](docs/native-depth.md).
Connecting an unknown MCP server to your agent is a real risk. You should be
skeptical. This page answers the questions a careful developer asks, factually.
Machine-readable version: the `security_v1` block in `get_agent_manifest`.

> Treat every MCP server as untrusted by default — including this one — and
> verify the claims below yourself. We are not independently audited.

## Official channels & anti-impersonation

HyperNatt is a small, verifiable project. Scammers may impersonate it — for
example by launching a fake token and pointing to our real links to look
legitimate. Verify anything claiming to be HyperNatt against this list.
**Only these channels are official:**

- Website: https://hypernatt.com
- Public code: https://github.com/DIALLOUBE-RESEARCH
- MCP server: https://hypernatt.com/mcp/protocol
- Telegram bot: https://t.me/hypernatt_bot
- Contact: contact@hypernatt.com

NATT, vault shares and Terminal usage credits are different instruments.
NATT rewards from vault trades are currently disabled. The swap reward and
claim circuit remains under qualification; a swap or an MCP credit is not by
itself proof of a NATT entitlement. See the [current documentation](https://hypernatt.com/docs)
for product status and contract identities. A matching token name, logo or link
does not establish authenticity. Contact us through the channels above when
verification is unclear.

## Surface (truth)

**5 tools · v2.10.0:** `get_agent_manifest` and `swap_via_nattswap` are free at MCP. `get_liq_radar` and `get_native_depth` cost 0.001 USDC or one eligible credit per call after available daily trials. Swap gas and route fees are separate.

Default path: free manifest + pay-per-call. Optional heavy use: Agent Pass
**$5 for 15,000 credits valid for 30 days** or eligible swap-earned credits, shared across the paid tools (not required). Current programs are in `get_agent_manifest` with `detail=full`.

## Can this server move or drain my funds?

**No.** It has no custody and never sees your keys.

- **Data tools are read-only** JSON context: radar, catalog, native BTC/ETH depth. They submit no Hyperliquid orders.
- **Swap is advisory**: `swap_via_nattswap` *returns* a Li.Fi quote and
  step-by-step instructions. **Your agent decides and signs its own
  transaction.** The server never holds keys and never broadcasts anything.

## Does it hold API keys I could leak?

**No keys required for the free manifest.** Payment is **x402, per call**
($0.001 USDC on Base or Solana), controlled by your agent — no accounts, no
static API keys, no subscription lock-in.

## What data does it see / store?

The tools process the arguments you supply: symbols and, for native depth, intended size. Tool-usage metadata includes wallet address when supplied, tool name and timestamp. No private key is required; the remote tools do not read your local files.

## Prompt injection / tool poisoning?

Tool responses are **structured JSON data** (state, scores, prices), not
free-form instructions. Interpretation guardrails (`interpretation_contract_v1`,
`do_not_infer`) bound how the data should be read. The swap tool's "instructions"
are **advisory for your agent to evaluate**, not commands the server executes.

## Seller-side x402 hardening (builders / auditors)

Seller payment verification must be assessed against the current source and
tests in this repository. A test or automated checker is not an independent
security audit and cannot establish that a system is unhackable.

## How do I verify all this?

- **Read the source** — https://github.com/DIALLOUBE-RESEARCH/hypernatt-terminal
- **Free catalog** — `curl -s https://hypernatt.com/api/m2m/agent/manifest`
- **Real 402** — `curl -i https://hypernatt.com/api/m2m/liq-radar`
- **Networks** — `curl -s https://hypernatt.com/.well-known/x402`
- **Current vault interface** — https://hypernatt.com/vault
  HyperEVM contracts and HyperCore trading belong to the separate vault product.
  This link is not evidence of Terminal MCP performance or an independent audit.

## Reporting a vulnerability

Open a private security advisory / issue on the GitHub repository above. We
respond to good-faith reports.

## What we do NOT claim

We do **not** claim to be unhackable, bank-grade, or independently audited.

We do **not** claim HyperNatt vault / platform performance pages
(e.g. `/stats`) as **HyperNatt Terminal MCP** results. This MCP provides radar, native BTC/ETH depth and swap routing for agents, separate from the vault's trading track record.

We claim only what is verifiable above. If a statement here is ever contradicted
by the code, the **code wins** — tell us.
