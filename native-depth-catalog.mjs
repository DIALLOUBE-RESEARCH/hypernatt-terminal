// F#379: recorded liquidity, wall history and observed flow. BTC/ETH only.
export const NATIVE_DEPTH_PRICE_USDC = 0.001;
export const NATIVE_DEPTH_TOOL = {
  name: "get_native_depth",
  operation: "quote",
  description:
    "BTC/ETH perpetual market context: four simultaneous recorded liquidity views (REF, M2, M5, AGG4), size coverage, fixed-price wall changes and observed aggressor buy/sell flow over 30s or 300s. Aggregated views see wider price ranges at coarser precision; never add their overlapping volumes. Combine with liquidation radar. Read agent_readout and quality first. No strategy signal, full-book claim or fill guarantee.",
};
export const NATIVE_DEPTH_NAMES = [NATIVE_DEPTH_TOOL.name];
export const NATIVE_DEPTH_HTTP_PREFIX = "/api/m2m/native-depth";
export const nativeDepthHttpPath = () => `${NATIVE_DEPTH_HTTP_PREFIX}/quote`;
export const NATIVE_DEPTH_SYMBOLS = ["BTC", "ETH"];

export function nativeDepthEnabled(env = process.env) {
  return env.TERMINAL_NATIVE_DEPTH_ENABLED !== "false";
}

export function nativeDepthManifestTools() {
  return [
    {
      name: NATIVE_DEPTH_TOOL.name,
      role: NATIVE_DEPTH_TOOL.description,
      price: "0.001 USD (1 credit)",
      credit_cost: 1,
      symbols: [...NATIVE_DEPTH_SYMBOLS],
      transport: "MCP+HTTP",
      endpoint: "https://hypernatt.com/mcp/protocol",
      // F#653: pay-per-call HTTP route (F#641), same price, POST JSON or GET URL parameters.
      http_endpoint: `https://hypernatt.com${nativeDepthHttpPath()}`,
      http_methods: ["POST", "GET"],
    },
  ];
}
