# Example responses (abbreviated schema illustrations)

Native depth: `get_native_depth` (0.001 USDC). [Guide](native-depth.md).
Canonical MCP surface: **5 tools** — see the [complete reference](reference.md). The snippet below illustrates radar fields; it is not a complete live response. Native depth fields are documented in [native-depth.md](native-depth.md).

---

## `get_liq_radar` — liquidation radar

**1 credit** · symbols: BTC ETH SOL BNB XRP HYPE ZEC (omit = BTC)

```json
{
  "ok": true,
  "product": "hypernatt_liq_radar_v1",
  "payload_schema": "hypernatt_liq_radar_v2",
  "symbol": "ETH",
  "binance_symbol": "ETHUSDT",
  "liq_radar": { "available": true }
}
```

**Read it:** multi-crypto liq / OI / cluster snapshot. Read-only market context —
not a trade signal. Clusters expose `largest_*_cluster` within ±10% of mark.

---

## Try it

```bash
# Payment discovery (HTTP 402 without eligible access):
curl -i "https://hypernatt.com/api/m2m/liq-radar?symbol=ETH"
```

MCP: `https://hypernatt.com/mcp/protocol` — tool `get_liq_radar`.
