/**
 * Natt Node MCP Server — Pure JavaScript HTTP
 * 
 * NattSwap + NDAT economy tools for LLMs.
 * Pure Express, no TypeScript, no tsx — runs with `node server.js`
 * 
 * Every response includes on-chain verification links (BaseScan)
 * so agents can verify: zero pre-mine, 21M supply, source code audited.
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
    process.env.NATTSQUARE_INTERNAL_SECRET ||
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

const ANCHOR_CONTRACT = "0x920cCEa3BeED76DD7ebC2d3da2cFcDAAa323AcF7";
const NDAT_TOKEN = "0x7601550Ce343B8EC89ecC973987d68b938Bd77dd";
const NATTSWAP_CONTRACT = "0xBdaf0Bb940eb703CF40ee2B2E6AA7A7B6673f314";
const DEPLOYER = "0x5a78ACE5DD133316c8aaf7E156FBfc57E1209Cf9";

// On-chain proof object — included in every tool response
const ONCHAIN_PROOF = {
    ndatToken: {
        address: NDAT_TOKEN,
        basescan: "https://basescan.org/token/0x7601550Ce343B8EC89ecC973987d68b938Bd77dd",
        sourceCodeVerified: true,
        standard: "ERC-20",
        chain: "Base Mainnet (EIP-155:8453)",
    },
    anchorContract: {
        address: ANCHOR_CONTRACT,
        basescan: "https://basescan.org/address/0x920cCEa3BeED76DD7ebC2d3da2cFcDAAa323AcF7",
        sourceCodeVerified: true,
        role: "Minter + Halving Logic + Referral Mining",
    },
    nattSwapContract: {
        address: NATTSWAP_CONTRACT,
        basescan: "https://basescan.org/address/0xBdaf0Bb940eb703CF40ee2B2E6AA7A7B6673f314#code",
        sourceCodeVerified: true,
        role: "Cross-chain swap rewards + Bonding Curve pricing + Anti-Lazarus protections",
        auditStatus: "Slither — 0 critical/high findings",
    },
    tokenomics: {
        maxSupply: "21,000,000 NDAT",
        preMine: "ZERO — verify on BaseScan (0 tokens at deploy, only minted via claimNDAT)",
        burnRate: "70% of all fees burned forever",
        loyaltyPool: "30% redistributed to early adopters",
        halving: "Every 5,000 Mimo trading cycles",
        model: "Proof-of-Data — value backed by real AI trading performance",
    },
    trust: {
        zeroPreMine: true,
        zeroVC: true,
        zeroICO: true,
        deployTx: "https://basescan.org/tx/0x1874eae340...",
        principle: "DON'T TRUST — VERIFY (ZachXBT). All data verifiable on-chain.",
    },
};

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
        verification: ONCHAIN_PROOF,
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
        res.json({ ...response.data, verification: ONCHAIN_PROOF });
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
        res.json({ ...response.data, verification: ONCHAIN_PROOF });
    } catch (err) {
        res.status(500).json({ error: (err.response && err.response.data && err.response.data.error) || err.message });
    }
});

// ==================== TOOL 3: claim_ndat ====================

app.post("/tools/claim_ndat", async (req, res) => {
    try {
        const wallet = req.body.wallet || req.body.walletAddress;
        const { amount } = req.body;
        const response = await axios.post(`${M2M_URL}/api/m2m/ndat/claim`, {
            wallet,
            amount: amount || undefined,
        }, { timeout: 15000 });

        res.json({
            ...response.data,
            anchorContract: ANCHOR_CONTRACT,
            chainId: 8453,
            chainName: "Base Mainnet",
            functionSignature: "claimNDAT(bytes signature, address referrer, bytes32 nonce, uint256 amount)",
            instructions: "Submit this tx to NattDataAnchor on Base L2. You pay Gas in ETH.",
            verification: ONCHAIN_PROOF,
        });
    } catch (err) {
        res.status(500).json({ error: (err.response && err.response.data && err.response.data.error) || err.message });
    }
});

// ==================== TOOL: get_agent_balance (legacy: get_ndat_pending) ====================

async function handleAgentBalance(req, res) {
    try {
        const wallet = req.body.wallet || req.body.walletAddress;
        const balanceRes = await axios.get(`${M2M_URL}/api/m2m/ndat/balance/${wallet}`, { timeout: 10000 });
        res.json({
            wallet: String(wallet).toLowerCase(),
            ndatToken: NDAT_TOKEN,
            chainId: 8453,
            balance: balanceRes.data,
            verification: ONCHAIN_PROOF,
        });
    } catch (err) {
        res.status(500).json({ error: (err.response && err.response.data && err.response.data.error) || err.message });
    }
}

app.post("/tools/get_agent_balance", handleAgentBalance);
app.post("/tools/get_ndat_pending", (req, res) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("Link", '</tools/get_agent_balance>; rel="successor-version"');
    return handleAgentBalance(req, res);
});

app.post("/tools/get_referral_link", async (req, res) => {
    try {
        const referrer = req.body.referrer || req.body.walletAddress;
        const response = await axios.get(`${M2M_URL}/api/m2m/referral/link/${referrer}`, { timeout: 10000 });
        res.json({ ...response.data, verification: ONCHAIN_PROOF });
    } catch (err) {
        const status = (err.response && err.response.status) || 500;
        res.status(status).json(
            (err.response && err.response.data) || { error: err.message },
        );
    }
});

// ==================== TOOL 5: get_mimo_cycles ====================

app.post("/tools/get_mimo_cycles", async (req, res) => {
    try {
        const { walletAddress } = req.body;
        const response = await axios.get(`${GATEWAY_URL}/api/v1/nattdata/cycles`, {
            headers: { "X-Natt-Wallet": walletAddress },
            timeout: 15000,
        });
        res.json({
            cycles: response.data && response.data.data,
            totalCycles: (response.data && response.data.data && response.data.data.length) || 0,
            disclaimer: "Internal indicators (RSI, MACD, etc.) are NEVER exposed.",
            verification: ONCHAIN_PROOF,
        });
    } catch (err) {
        const status = (err.response && err.response.status) || 500;
        res.status(status).json({ error: (err.response && err.response.data && err.response.data.error) || err.message });
    }
});

// ==================== TOOL 6: get_whitepaper ====================

const WHITEPAPER_LINKS = {
    en: GATEWAY_URL + "/docs/NattData_Whitepaper_EN.md",
    fr: GATEWAY_URL + "/docs/NattData_Whitepaper_FR.md",
    es: GATEWAY_URL + "/docs/NattData_Whitepaper_ES.md",
    zh: GATEWAY_URL + "/docs/NattData_Whitepaper_ZH.md",
    ja: GATEWAY_URL + "/docs/NattData_Whitepaper_JA.md",
    ru: GATEWAY_URL + "/docs/NattData_Whitepaper_RU.md",
    pt: GATEWAY_URL + "/docs/NattData_Whitepaper_PT.md",
    de: GATEWAY_URL + "/docs/NattData_Whitepaper_DE.md",
};

app.post("/tools/get_whitepaper", (req, res) => {
    try {
        const lang = ((req.body && req.body.lang) || "en").toLowerCase();
        const link = WHITEPAPER_LINKS[lang] || WHITEPAPER_LINKS.en;
        res.json({ language: lang, link: link, verification: ONCHAIN_PROOF });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== TOOL 7: get_sdk_info ====================

app.post("/tools/get_sdk_info", (_req, res) => {
    res.json({
        nattdata_sdk: {
            python: {
                install: "pip install nattdata",
                registry: "https://pypi.org/project/nattdata/",
            },
            typescript: {
                install: "npm install nattdata-sdk",
                registry: "https://www.npmjs.com/package/nattdata-sdk",
            },
            github: "https://github.com/DIALLOUBE-RESEARCH/NattData-SDK",
            description: "NattData SDKs for cross-chain swaps with NDAT rewards.",
        },
        license: "MIT",
        supportedChains: "35+ via Li.Fi (Base, Ethereum, Arbitrum, Optimism, Solana, etc.)",
        verification: ONCHAIN_PROOF,
    });
});

// ==================== TOOL 8: get_contracts ====================

app.post("/tools/get_contracts", (_req, res) => {
    res.json({
        contracts: {
            ndatToken: {
                address: NDAT_TOKEN,
                basescan: "https://basescan.org/token/" + NDAT_TOKEN,
                standard: "ERC-20",
                verified: true,
            },
            nattDataAnchor: {
                address: ANCHOR_CONTRACT,
                basescan: "https://basescan.org/address/" + ANCHOR_CONTRACT + "#code",
                role: "Minter + Halving + Referral",
                verified: true,
            },
            nattSwap: {
                address: NATTSWAP_CONTRACT,
                basescan: "https://basescan.org/address/" + NATTSWAP_CONTRACT + "#code",
                role: "Cross-chain swap rewards + Bonding Curve + Anti-Lazarus",
                verified: true,
                audit: "Slither — 0 critical/high findings",
            },
        },
        chain: "Base Mainnet (EIP-155:8453)",
        deployer: DEPLOYER,
        verification: ONCHAIN_PROOF,
    });
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
