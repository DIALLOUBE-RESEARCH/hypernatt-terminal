# HyperNatt Terminal — Agentic Workflow Diagram

**Future Caribbean Global AI Buildathon · Track 02 — Finance, Payments & MSME Capital**  
**OpenClaw stack alignment:** MCP · x402 · agent-native payments · GOAT / Base / Solana

> Diagram for application form. GitHub renders Mermaid below.

**Historical diagram scope, MCP v2.7.0 — 3 tools:** `get_agent_manifest`, `get_liq_radar`, `swap_via_nattswap`.

The current **v2.10.0** catalog has **5 tools**: `get_agent_manifest`, `get_liq_radar`,
`swap_via_nattswap`, `get_native_depth`. Native depth is BTC/ETH only; see [native-depth.md](native-depth.md).

---

## System overview

```mermaid
flowchart TB
  subgraph INPUTS["Inputs"]
    A1["External AI agent<br/>(Claude, Cursor, OpenClaw, custom)"]
    A2["Human operator<br/>(optional oversight)"]
    A3["Agent wallet<br/>USDC on Base or Solana"]
  end

  subgraph DISCOVERY["Discovery — free (MCP standard)"]
    D1["MCP initialize / tools/list"]
    D2["get_agent_manifest<br/>REST or MCP"]
  end

  subgraph PAYWALL["Payment gate — x402 seller"]
    P0{"Intro free?<br/>1st get_liq_radar"}
    P1{"Swap quota?"}
    P2{"Agent Pass $5/mo?"}
    P3["HTTP 402 + PAYMENT-REQUIRED<br/>Base eip155:8453 + Solana"]
    P4["verify → settle → deliver<br/>CDP facilitator"]
  end

  subgraph MCP["HyperNatt Terminal MCP<br/>hypernatt.com/mcp/protocol"]
    T1["get_agent_manifest"]
    T2["get_liq_radar"]
    T3["swap_via_nattswap · Li.Fi"]
  end

  subgraph DATA["Data sources & APIs"]
    HL["HyperLiquid L2<br/>orderbook · OI · liquidations"]
    LIFI["Li.Fi cross-chain<br/>swap routes"]
  end

  subgraph CORE["Liq radar engine (server)"]
    C1["Magnet / OI / cluster snapshot"]
    C2["Whitelist: BTC ETH SOL BNB XRP HYPE ZEC"]
    C3["Fail-closed if data stale"]
  end

  subgraph HITL["Human-in-the-loop"]
    H2["Agent operator<br/>approves wallet spend"]
    H3["No auto-trade on MCP<br/>read-only intelligence"]
  end

  subgraph OUTPUTS["Outputs"]
    O1["Structured JSON<br/>liq_radar snapshot"]
    O2["On-chain proof links<br/>x402 receipt"]
    O3["Agent decision context<br/>not financial advice"]
  end

  A1 --> D1 --> D2
  A1 --> MCP
  A2 -.->|monitors| A1
  A3 --> PAYWALL

  MCP --> P0
  P0 -->|yes| CORE
  P0 -->|no| P1
  P1 -->|no| P2
  P2 -->|no| P3
  P3 --> A3
  A3 --> P4 --> CORE

  T2 --> CORE
  T3 --> LIFI
  T1 --> D2

  HL --> CORE

  CORE --> O1
  P4 --> O2
  CORE --> O3

  H2 -.-> A3
  H3 -.-> MCP
```

---

## Sequence — agent pays and reads liq radar

```mermaid
sequenceDiagram
  autonumber
  participant Agent as AI Agent
  participant Wallet as Agent wallet (Base/Solana)
  participant MCP as HyperNatt Terminal MCP
  participant X402 as x402 seller (verify/settle)
  participant HL as HyperLiquid / venue APIs
  participant Human as Human operator (optional)

  Agent->>MCP: tools/call get_liq_radar
  alt First call (intro free)
    MCP->>HL: fetch OI + liquidation context
    HL-->>MCP: live microstructure
    MCP-->>Agent: JSON liq_radar (free)
  else Paywall
    MCP-->>Agent: HTTP 402 + accepts[] dual rail
    Human-->>Agent: approve spend (HITL policy)
    Agent->>Wallet: sign USDC payment
    Wallet->>X402: on-chain settle
    X402->>MCP: payment confirmed
    MCP->>HL: fetch live data
    HL-->>MCP: live microstructure
    MCP-->>Agent: JSON liq_radar + receipt
  end
  Agent->>Agent: decide trade / hold / route
  Note over Agent,Human: MCP is read-only — no auto-execution
```

---

## Key decision points

| Step | Decision | Fail mode |
|------|----------|-----------|
| Tool discovery | MCP `tools/list` (3 tools) | Standard MCP errors |
| Intro eligibility | First `get_liq_radar` | Falls through to paywall |
| Payment | x402 verify → settle before deliver | 402 until paid; no grant on failed settle |
| Data freshness | Stale feed | Fail-closed / degraded flag |
| Agent action | Agent chooses use of JSON | No server-side auto-trade |

---

## Links

| Resource | URL |
|----------|-----|
| MCP endpoint | https://hypernatt.com/mcp/protocol |
| Server card | https://hypernatt.com/.well-known/mcp/server-card.json |
| Repo | https://github.com/DIALLOUBERESEARCH/hypernatt-terminal |
| Loom (application) | https://www.loom.com/share/618c17521a964a60a6b6605c196a6460 |

---

MIT · DIALLOUBE-RESEARCH · HyperNatt Terminal v2.7.0
