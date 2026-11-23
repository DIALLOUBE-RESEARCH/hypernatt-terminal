/**
 * Natt Node MCP Server — Pure JavaScript HTTP
 * 
 * NattSwap tools for LLMs.
 * Pure Express, no TypeScript, no tsx — runs with `node server.js`
 */
const express = require("express");
const axios = require("axios");
const pkg = require("./package.json");
const serverCard = require("./server-card.json");

const app = express();
// Dedicated REST router precedes the default JSON parser so unpaid probes get402.
const nativeHttp = express.Router();
app.use('/api/m2m/native-depth', nativeHttp);
app.use(["/protocol", "/messages"], express.json({ limit: "2mb" }));
app.use(express.json());

const MCP_PORT = parseInt(process.env.MCP_PORT || "8011");
const M2M_URL = process.env.M2M_SERVICE_URL || "http://m2m-service:8010";
const GATEWAY_URL = process.env.GATEWAY_URL || "https://hypernatt.com";
const INTERNAL_SECRET =
    process.env.M2M_INTERNAL_SECRET ||
    "";

function internalM2mHeaders() {
    return INTERNAL_SECRET
        ? { "X-M2M-Internal-Secret": INTERNAL_SECRET, Accept: "application/json" }
        : { Accept: "application/json" };
}

async function fetchInternalSwapQuote(params) {
    return axios.get(`${M2M_URL}/api/m2m/internal/swap/quote`, {
        params,
        headers: internalM2mHeaders(),
        timeout: 30000,
    });
}

// ==================== HEALTH ====================

const MCP_TOOL_NAMES = new Set([
    "get_agent_manifest",
    "get_liq_radar",
    "swap_via_nattswap",
    "get_native_depth",
    "get_l2_archive_catalog",
]);

function terminalToolsFromCard() {
    return serverCard.tools.map((tool) => ({
        name: tool.name,
        method: MCP_TOOL_NAMES.has(tool.name) ? "MCP" : "POST",
        path: MCP_TOOL_NAMES.has(tool.name)
            ? "/mcp/protocol"
            : `/tools/${tool.name}`,
        description: tool.description,
    }));
}

app.get("/health", async (_req, res) => {
    let mcpSessions = null;
    try {
        const mod = await import("./mcp-session-resilience.mjs");
        mcpSessions = mod.getMcpSessionStats();
    } catch {
        mcpSessions = null;
    }
    res.json({
        status: "healthy",
        service: "hypernatt-terminal",
        version: serverCard.serverInfo.version || pkg.version,
        port: MCP_PORT,
        tools: serverCard.tools.length,
        mcp_sessions_v1: mcpSessions,
    });
});

// ==================== LIST TOOLS ====================

app.get("/tools", (_req, res) => {
    res.json({
        server: "hypernatt-terminal",
        version: serverCard.serverInfo.version || pkg.version,
        tools: terminalToolsFromCard(),
        mcp: { streamable_http: "/mcp/protocol", sse: "/mcp/sse" },
    });
});

// ==================== TOOL 1: swap_via_nattswap ====================

app.post("/tools/swap_via_nattswap", async (req, res) => {
    try {
        const { fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, toAddress, slippage } = req.body;
        const response = await fetchInternalSwapQuote({
            fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, toAddress, slippage,
        });
        res.json(response.data);
    } catch (err) {
        const status = (err.response && err.response.status) || 500;
        res.status(status).json(
            (err.response && err.response.data) || { error: err.message },
        );
    }
});

app.post("/tools/swap_quote", async (req, res) => {
    try {
        const { fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, toAddress, slippage } = req.body;
        const response = await fetchInternalSwapQuote({
            fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, toAddress, slippage,
        });
        res.json(response.data);
    } catch (err) {
        const status = (err.response && err.response.status) || 500;
        res.status(status).json(
            (err.response && err.response.data) || { error: err.message },
        );
    }
});

// ==================== TOOL: register_nattswap_reward ====================

app.post("/tools/register_nattswap_reward", async (req, res) => {
    try {
        const response = await axios.post(`${M2M_URL}/api/m2m/swap/register`, req.body, { timeout: 15000 });
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: (err.response && err.response.data && err.response.data.error) || err.message });
    }
});

app.post("/tools/get_referral_link", async (req, res) => {
    try {
        const referrer = req.body.referrer || req.body.walletAddress;
        const response = await axios.get(`${M2M_URL}/api/m2m/referral/link/${referrer}`, { timeout: 10000 });
        res.json(response.data);
    } catch (err) {
        const status = (err.response && err.response.status) || 500;
        res.status(status).json(
            (err.response && err.response.data) || { error: err.message },
        );
    }
});

// ==================== START ====================

(async () => {
    const { createNativeDepthHttpRouter } = await import('./native-depth-http.mjs');
    nativeHttp.use(createNativeDepthHttpRouter({ m2mUrl: M2M_URL, internalSecret: INTERNAL_SECRET }));
    try {
        const { mountMcpSignalRoutes } = await import("./mcp-signal-server.mjs");
        mountMcpSignalRoutes(app);
    } catch (err) {
        console.error("[MCP Signal] Failed to load x402 MCP module:", err);
    }

    app.listen(MCP_PORT, "0.0.0.0", () => {
        console.log(
            "[hypernatt-terminal] HTTP on port " +
                MCP_PORT +
                " (v" +
                (serverCard.serverInfo.version || pkg.version) +
                ", " +
                serverCard.tools.length +
                " tools)",
        );
        console.log("[hypernatt-terminal] MCP Streamable: /protocol | SSE: /sse");
        console.log("[hypernatt-terminal] M2M: " + M2M_URL);
    });
})();
