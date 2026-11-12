/**
 * F#22 / F99N — MCP SSE + Streamable HTTP server.
 * Surface: manifest, radar, swap, native depth (CANON_4).
 *
 * Public (nginx strips /mcp prefix):
 *   GET  /mcp/sse       -> container /sse
 *   POST /mcp/messages  -> container /messages
 *   *    /mcp/protocol  -> container /protocol
 */
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LIQ_RADAR_X402 } from "./x402-data-products.mjs";
import { settlePaymentWithFacilitator } from "./x402-facilitator-client.mjs";
import {
    isTerminalX402FunnelEnabled,
    isDeliverAfterSettleEnabled,
    settleTerminalPayment,
} from "./x402-funnel-terminal.mjs";
import {
    isSvmCompatEnabled,
    preparePaymentForCdp,
} from "./x402-svm-prepare.mjs";
import {
    PayToMismatchError,
    AssetMismatchError,
    NetworkMismatchError,
    FeePayerMismatchError,
    AmountMismatchError,
} from "./x402-svm-hydrate.mjs";
import {
    assertSessionClient,
    clientKeyFromHttpRequest,
    isSessionBindEnabled,
    registerSessionClient,
    removeSessionClient,
} from "./mcp-session-bind.mjs";
import { extractPayerWallet, networkFromPayload, recordX402Event } from "./x402-telemetry.mjs";
import { checkBetaBypass, recordBetaPostCall } from "./x402-beta.mjs";
import { checkPaywallPrecheck, consumePaywall } from "./x402-quota.mjs";
import { TRIAL_SYMBOLS, terminalTrialPolicy } from "./terminal-trial-policy.mjs";
import { enrichPaymentRequiredPayload } from "./agent-payment-error.mjs";
import { registerTerminalSwapTools } from "./mcp-free-tools.mjs";
import { registerGrowthTools } from "./mcp-growth-tools.mjs";
import { registerL2ArchiveCatalogTool, L2_ARCHIVE_CATALOG_TOOL } from "./mcp-datasets-tool.mjs";
import { registerNativeDepthTool } from "./native-depth-public.mjs";
import { NATIVE_DEPTH_NAMES } from "./native-depth-catalog.mjs";
import {
    bindActiveSessionCounter,
    isStaleMcpSession,
    recordSessionClosed,
    recordSessionCreated,
    respondStaleSession,
} from "./mcp-session-resilience.mjs";

const TERMINAL_VERSION = "2.10.0";

const M2M_URL = process.env.M2M_SERVICE_URL || "http://m2m-service:8010";
const INTERNAL_SECRET =
    process.env.M2M_INTERNAL_SECRET ||
    process.env.NATTSQUARE_INTERNAL_SECRET ||
    "";
const PUBLIC_LIQ_RADAR_URL =
    process.env.PUBLIC_LIQ_RADAR_URL ||
    "https://hypernatt.com/api/m2m/liq-radar";

import { toolDescriptionFromCard, getServerCard } from "./server-card-tools.mjs";

const SERVER_TITLE =
    "HyperNatt Terminal — Radar, Native Depth + Swap for AI Agents";

const TERMINAL_ONCHAIN_PROOF = {
    ndatToken: {
        address: "0x7601550Ce343B8EC89ecC973987d68b938Bd77dd",
        basescan:
            "https://basescan.org/token/0x7601550Ce343B8EC89ecC973987d68b938Bd77dd",
    },
    anchorContract: {
        address: "0x920cCEa3BeED76DD7ebC2d3da2cFcDAAa323AcF7",
        basescan:
            "https://basescan.org/address/0x920cCEa3BeED76DD7ebC2d3da2cFcDAAa323AcF7",
    },
};

/** sessionId -> X-Payment header captured from HTTP POST */
const sessionPayments = new Map();

/** sessionId -> { ip, userAgent } for paywall client_key fallback */
const sessionClientMeta = new Map();

/** F85N — sessionId -> { clientKey, at } */
const sessionClientKeys = new Map();

/** sessionId -> active MCP transport */
const transports = new Map();

bindActiveSessionCounter(() => transports.size);

function advertisedFreeDailyCap() {
    if (process.env.X402_FREE_TIER_ENABLED === "false") {
        return 0;
    }
    const n = parseInt(process.env.X402_FREE_DAILY_CREDITS || "25", 10);
    if (!Number.isFinite(n)) {
        return 25;
    }
    return Math.min(50, Math.max(1, n));
}

function paymentErrorResult(buildRequired, ctx) {
    const base =
        typeof buildRequired === "function" ? buildRequired() : buildRequired;
    const enriched = enrichPaymentRequiredPayload(base, {
        reasonCode: ctx.reasonCode,
        tool: ctx.tool,
        symbol: ctx.symbol,
        creditsRemaining: ctx.creditsRemaining ?? 0,
        dailyCap: ctx.dailyCap ?? advertisedFreeDailyCap(),
        introFreeAvailable: ctx.introFreeAvailable,
        priceUsdc: ctx.priceUsdc,
    });
    return jsonToolResult(enriched, true);
}

function jsonToolResult(value, isError = false) {
    return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
        ...(isError ? { isError: true } : {}),
    };
}

/**
 * F#32N — shared payment phase for paid tools: telemetry on every funnel
 * step (402_shown / payment_invalid / payment_verified / payment_settled)
 * and on-chain settlement (the MCP path used to verify but NEVER settle).
 *
 * Returns { errorResult } to short-circuit, or { ok: true } to proceed.
 */
function normalizeAgentWallet(wallet) {
    if (typeof wallet !== "string") return null;
    const w = wallet.trim().toLowerCase();
    return /^0x[a-f0-9]{40}$/.test(w) ? w : null;
}

function onToolCallRecorded({
    wallet,
    tool,
    priceUsdc,
    sessionId,
    betaBypass = false,
    quotaBypass = false,
}) {
    if (!wallet) return;
    recordBetaPostCall({
        wallet,
        tool,
        outcome: quotaBypass
            ? "quota_bypass"
            : betaBypass
              ? "beta_bypass"
              : "ok",
        price_usdc: betaBypass || quotaBypass ? 0 : priceUsdc,
        session_id: sessionId || null,
    });
}

export async function processPaidToolPayment({
    tool,
    symbol,
    priceUsdc,
    paymentRaw,
    agent_wallet,
    sessionId,
    mcp_client_id,
    clientMeta,
    parse,
    verify,
    buildRequired,
    buildRequirements: buildReqs,
    beforeCharge,
}) {
    const headerWallet = normalizeAgentWallet(agent_wallet);
    const clientId = mcp_client_id || sessionId || null;
    const meta = clientMeta || (sessionId ? sessionClientMeta.get(sessionId) : null);

    // New data products require the existing synchronous settlement gate.
    if (beforeCharge && paymentRaw && (!isTerminalX402FunnelEnabled() || !isDeliverAfterSettleEnabled())) {
        return { errorResult: paymentErrorResult(buildRequired, { reasonCode: "PAYWALL_UNAVAILABLE", tool, priceUsdc }) };
    }

    if (headerWallet && (await checkBetaBypass(headerWallet, tool))) {
        await beforeCharge?.();
        console.log(`[F#36N] beta bypass MCP: ${headerWallet} → ${tool}`);
        return {
            ok: true,
            wallet: headerWallet,
            betaBypass: true,
            clientKey: null,
        };
    }

    const pre = await checkPaywallPrecheck({
        wallet: headerWallet,
        tool,
        symbol,
        mcpClientId: clientId,
        hasPayment: Boolean(paymentRaw),
        ip: meta?.ip,
        userAgent: meta?.userAgent,
    });

    if (!pre.allow) {
        recordX402Event({
            event_type: "402_shown",
            tool,
            price_usdc: priceUsdc,
        });
        return {
            errorResult: paymentErrorResult(buildRequired, {
                reasonCode: pre.paywallUnavailable
                    ? "PAYWALL_UNAVAILABLE"
                    : "FREE_TIER_EXHAUSTED",
                tool,
                symbol,
                creditsRemaining: 0,
                priceUsdc,
            }),
        };
    }

    if (!paymentRaw) {
        await beforeCharge?.();
        const consumed = await consumePaywall({
            wallet: headerWallet,
            tool,
            symbol,
            clientKey: pre.clientKey,
            mcpClientId: clientId,
            ip: meta?.ip,
            userAgent: meta?.userAgent,
        });
        if (consumed.consumed) {
            console.log(
                `[F#40N] ${consumed.method || "paywall"} bypass MCP: ${headerWallet || pre.clientKey?.slice(0, 8)} → ${tool}`,
            );
            return {
                ok: true,
                wallet: headerWallet,
                quotaBypass: consumed.method === "quota",
                freeBypass: consumed.method === "free",
                introBypass: consumed.method === "intro",
                passBypass: consumed.method === "pass",
                clientKey: pre.clientKey,
            };
        }
        recordX402Event({
            event_type: "402_shown",
            tool,
            price_usdc: priceUsdc,
        });
        return {
            errorResult: paymentErrorResult(buildRequired, {
                reasonCode: consumed.paywallUnavailable
                    ? "PAYWALL_UNAVAILABLE"
                    : "FREE_TIER_EXHAUSTED",
                tool,
                symbol,
                creditsRemaining: 0,
                priceUsdc,
            }),
        };
    }

    let paymentPayload;
    try {
        paymentPayload = parse(paymentRaw);
    } catch {
        recordX402Event({
            event_type: "402_shown",
            tool,
            price_usdc: priceUsdc,
            detail: "invalid x_payment format",
        });
        return {
            errorResult: paymentErrorResult(
                () => buildRequired("Invalid x_payment format"),
                {
                    reasonCode: "PAYMENT_REQUIRED",
                    tool,
                    priceUsdc,
                },
            ),
        };
    }

    const wallet = extractPayerWallet(paymentPayload);
    let cdpPayload = paymentPayload;
    let serverRequirements = buildReqs();
    if (isSvmCompatEnabled()) {
        try {
            const prep = preparePaymentForCdp(paymentPayload, serverRequirements);
            cdpPayload = prep.payload;
            serverRequirements = prep.serverReq;
        } catch (err) {
            const isMismatch =
                err instanceof PayToMismatchError ||
                err instanceof AssetMismatchError ||
                err instanceof NetworkMismatchError ||
                err instanceof FeePayerMismatchError ||
                err instanceof AmountMismatchError;
            if (isMismatch) {
                const field = err.field || "mismatch";
                const detail = String(err.message || "").slice(0, 500);
                recordX402Event({
                    event_type: "payment_invalid",
                    tool,
                    payer_wallet: wallet,
                    agent_id: wallet,
                    network: networkFromPayload(cdpPayload),
                    price_usdc: priceUsdc,
                    detail,
                    facilitator_error: `${field}_mismatch`,
                });
                return {
                    errorResult: paymentErrorResult(
                        () => buildRequired(detail),
                        {
                            reasonCode: "PAYMENT_REQUIRED",
                            tool,
                            priceUsdc,
                        },
                    ),
                };
            }
            throw err;
        }
    }

    await beforeCharge?.();
    if (isTerminalX402FunnelEnabled()) {
        const settled = await settleTerminalPayment({
            paymentPayload: cdpPayload,
            serverRequirements,
        });
        if (!settled.ok) {
            const detail = String(settled.error || "").slice(0, 500);
            recordX402Event({
                event_type:
                    settled.reason === "payment_invalid"
                        ? "payment_invalid"
                        : "402_shown",
                tool,
                payer_wallet: wallet,
                agent_id: wallet,
                network: networkFromPayload(cdpPayload),
                price_usdc: priceUsdc,
                detail,
                facilitator_error: detail,
            });
            return {
                errorResult: paymentErrorResult(
                    () =>
                        buildRequired(
                            settled.reason === "payment_already_used"
                                ? "Payment already used"
                                : settled.error || "Payment failed",
                        ),
                    {
                        reasonCode: "PAYMENT_REQUIRED",
                        tool,
                        priceUsdc,
                    },
                ),
            };
        }

        recordX402Event({
            event_type: "payment_verified",
            tool,
            payer_wallet: wallet,
            agent_id: wallet,
            network: networkFromPayload(cdpPayload),
            price_usdc: priceUsdc,
        });
        recordX402Event({
            event_type: "payment_settled",
            tool,
            payer_wallet: wallet,
            agent_id: wallet,
            network: networkFromPayload(cdpPayload),
            price_usdc: priceUsdc,
            tx_hash: settled.txHash || null,
        });

        return { ok: true, wallet, betaBypass: false, clientKey: pre.clientKey };
    }

    const verification = await verify(cdpPayload);
    if (!verification.isValid) {
        recordX402Event({
            event_type: "payment_invalid",
            tool,
            payer_wallet: extractPayerWallet(paymentPayload),
            agent_id: extractPayerWallet(paymentPayload),
            network: networkFromPayload(cdpPayload),
            price_usdc: priceUsdc,
            detail: String(verification.error || "").slice(0, 500),
            facilitator_error: String(verification.error || "").slice(0, 500),
        });
        return {
            errorResult: paymentErrorResult(
                () => buildRequired(`Payment invalid: ${verification.error}`),
                {
                    reasonCode: "PAYMENT_REQUIRED",
                    tool,
                    priceUsdc,
                },
            ),
        };
    }

    recordX402Event({
        event_type: "payment_verified",
        tool,
        payer_wallet: wallet,
        agent_id: wallet,
        network: networkFromPayload(cdpPayload),
        price_usdc: priceUsdc,
    });

    settlePaymentWithFacilitator(
        cdpPayload,
        isSvmCompatEnabled()
            ? serverRequirements
            : (paymentPayload?.accepted ?? buildReqs()),
    ).then((result) => {
        if (result.success) {
            console.log(
                `[F#32N] 💰 ${tool} settled: ${result.txHash || "simulated"}`,
            );
            recordX402Event({
                event_type: "payment_settled",
                tool,
                payer_wallet: wallet,
                agent_id: wallet,
                network: networkFromPayload(cdpPayload),
                price_usdc: priceUsdc,
                tx_hash: result.txHash || null,
            });
        }
    });
    return { ok: true, wallet, betaBypass: false, clientKey: pre.clientKey };
}

export function createMcpServer() {
    const server = new McpServer({
        name: "hypernatt-terminal",
        version: TERMINAL_VERSION,
    });

    const freeCtx = {
        m2mUrl: M2M_URL,
        internalSecret: INTERNAL_SECRET,
        onchainProof: TERMINAL_ONCHAIN_PROOF,
    };
    registerGrowthTools(server, freeCtx);
    registerTerminalSwapTools(server, freeCtx);
    registerL2ArchiveCatalogTool(server);
    registerNativeDepthTool(server, {
        m2mUrl: M2M_URL, internalSecret: INTERNAL_SECRET,
        pay: processPaidToolPayment,
        sessionPayment: (sessionId) => sessionId ? sessionPayments.get(sessionId) : undefined,
        record: onToolCallRecorded,
    });

    // Existing radar payment and data path remains unchanged.
    server.registerTool(
        "get_liq_radar",
        {
            // F#645: purpose first, F#132 cluster_grammar rule in the first lines, terms defined, siblings named.
            description: toolDescriptionFromCard(
                "get_liq_radar",
                "Returns the liquidation map of one coin (BTC, ETH, SOL, BNB, XRP, HYPE or ZEC; default BTC). If cluster_grammar is present, read it first: class=noise (distance <3%) is high-leverage bait to ignore; class=true (~7%+) is the low-leverage stack. The liq_radar block (hypernatt_liq_radar_v2) holds modeled liquidation clusters (zones where leveraged positions may liquidate), observed real_liquidations, open interest (OI) and long/short (L/S) context, and magnet.score (directional density bias from OI, L/S and funding; not a hit probability). USE WHEN an agent needs liquidation terrain for timing or sizing. NOT WHEN it needs order-book depth for a BTC/ETH size (use get_native_depth) or a swap (use swap_via_nattswap). Read-only; terrain, not a trade signal. Price: 0.001 USDC/call via x402 (Base or Solana) or eligible credits.",
            ),
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
            inputSchema: {
                x_payment: z
                    .string()
                    .optional()
                    .describe(
                        "Base64 x402 USDC payment. Rails: Base eip155:8453 (EIP-3009) OR Solana SVM exact (@x402/svm; not an EVM signature). Omit on first call to receive 402 accepts[]; retry after paying $0.001/call.",
                    ),
                agent_wallet: z
                    .string()
                    .optional()
                    .describe(
                        "Optional EVM wallet (0x + 40 hex). Skips x402 when swap-earned quota balance covers this tool's credit weight.",
                    ),
                symbol: z
                    .enum(TRIAL_SYMBOLS)
                    .optional()
                    .describe(
                        "Optional crypto symbol (BTC ETH SOL BNB XRP HYPE ZEC). Default BTC when omitted.",
                    ),
            },
        },
        async ({ x_payment, agent_wallet, symbol }, extra) => {
            let paymentRaw = x_payment;
            if (!paymentRaw && extra?.sessionId) {
                paymentRaw = sessionPayments.get(extra.sessionId);
            }

            const payment = await processPaidToolPayment({
                tool: "get_liq_radar",
                symbol: symbol ?? "BTC",
                priceUsdc: LIQ_RADAR_X402.priceUsdc,
                paymentRaw,
                agent_wallet,
                sessionId: extra?.sessionId,
                parse: LIQ_RADAR_X402.parsePaymentHeader,
                verify: LIQ_RADAR_X402.verifyPayment,
                buildRequired: LIQ_RADAR_X402.buildPaymentRequired,
                buildRequirements: LIQ_RADAR_X402.buildPaymentRequirements,
            });
            if (payment.errorResult) {
                return payment.errorResult;
            }

            if (!INTERNAL_SECRET) {
                return jsonToolResult(
                    { error: "MCP server missing NATTSQUARE_INTERNAL_SECRET" },
                    true,
                );
            }

            try {
                const fetchOpts =
                    symbol != null && String(symbol).trim() !== ""
                        ? { symbol: String(symbol).trim() }
                        : undefined;
                const payload = await LIQ_RADAR_X402.fetchPayload(
                    M2M_URL,
                    INTERNAL_SECRET,
                    fetchOpts,
                );
                onToolCallRecorded({
                    wallet: payment.wallet,
                    tool: "get_liq_radar",
                    priceUsdc: LIQ_RADAR_X402.priceUsdc,
                    sessionId: extra?.sessionId,
                    betaBypass: payment.betaBypass,
                    quotaBypass: payment.quotaBypass,
                });
                return jsonToolResult({
                    ok: true,
                    source: "hypernatt_liq_radar_v1",
                    public_url: PUBLIC_LIQ_RADAR_URL,
                    data: payload,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return jsonToolResult(
                    { error: "get_liq_radar_fetch_failed", message },
                    true,
                );
            }
        },
    );

    return server;
}

function capturePaymentHeader(req, sessionId) {
    const xPay = req.headers["x-payment"] || req.headers["payment-signature"];
    if (sessionId && xPay) {
        sessionPayments.set(String(sessionId), xPay);
    }
}

/**
 * Streamable HTTP transport rejects requests unless Accept includes text/event-stream.
 * Claude connector often sends only application/json on tools/call → 406.
 * Hono reads rawHeaders — mutating req.headers alone is not enough.
 */
export function ensureStreamableHttpAccept(req) {
    const fixed = "application/json, text/event-stream";
    if (typeof req.setHeader === "function") {
        try {
            req.setHeader("Accept", fixed);
            return;
        } catch {
            // read-only IncomingMessage — fall through
        }
    }
    req.headers.accept = fixed;
    const raw = req.rawHeaders;
    if (!Array.isArray(raw)) {
        return;
    }
    for (let i = 0; i < raw.length; i += 2) {
        if (String(raw[i]).toLowerCase() === "accept") {
            raw[i + 1] = fixed;
            return;
        }
    }
    raw.push("Accept", fixed);
}

/**
 * @param {import('express').Express} app
 */
export function mountMcpSignalRoutes(app) {
    app.get("/.well-known/mcp/server-card.json", (_req, res) => {
        const card = getServerCard();
        if (card) {
            res.json(card);
            return;
        }
        res.status(404).json({ error: "server-card not configured" });
    });

    app.post("/internal/x402/create-payment", async (req, res) => {
        const secret =
            req.headers["x-m2m-internal-secret"] ||
            req.headers["X-M2M-Internal-Secret"];
        if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
            res.status(401).json({ error: "unauthorized" });
            return;
        }
        try {
            const { createX402PaymentPayload } = await import("./x402-buyer.mjs");
            const body = req.body?.paymentRequired ?? req.body;
            if (!body?.accepts?.length) {
                res.status(400).json({ error: "missing accepts[] in paymentRequired" });
                return;
            }
            const paymentPayload = await createX402PaymentPayload(body);
            res.json({ ok: true, paymentPayload });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[x402-buyer] create-payment failed:", message);
            res.status(500).json({ ok: false, error: message });
        }
    });

    app.get("/signal/info", (_req, res) => {
        res.json({
            name: "hypernatt-terminal",
            title: SERVER_TITLE,
            version: TERMINAL_VERSION,
            tools: [
                "get_agent_manifest",
                "get_liq_radar",
                "swap_via_nattswap",
                L2_ARCHIVE_CATALOG_TOOL,
                ...NATIVE_DEPTH_NAMES,
            ],
            trial_policy_v2: terminalTrialPolicy(),
            transports: {
                sse: "/mcp/sse",
                messages: "/mcp/messages",
                streamable_http: "/mcp/protocol",
            },
            x402: {
                liq_radar: {
                    price_usdc: LIQ_RADAR_X402.priceUsdc,
                    pay_to: LIQ_RADAR_X402.payTo,
                    public_url: PUBLIC_LIQ_RADAR_URL,
                    symbols: ["BTC", "ETH", "SOL", "BNB", "XRP", "HYPE", "ZEC"],
                },
                network: "eip155:8453",
            },
            homepage: "https://hypernatt.com",
            ecosystem_note:
                "HyperNatt platform at hypernatt.com; hypernatt-terminal MCP is one agent integration brick. Vault pages are not Terminal MCP P&L.",
            products: ["hypernatt_liq_radar_v1", "hypernatt_native_depth_v1"],
        });
    });

    // Streamable HTTP MCP (recommended)
    app.all("/protocol", async (req, res) => {
        try {
            ensureStreamableHttpAccept(req);
            const sessionId = req.headers["mcp-session-id"];
            capturePaymentHeader(req, sessionId);

            if (
                isSessionBindEnabled() &&
                sessionId &&
                !assertSessionClient(
                    sessionClientKeys,
                    String(sessionId),
                    clientKeyFromHttpRequest(req),
                )
            ) {
                res.status(403).json({ error: "session_client_mismatch" });
                return;
            }

            if (isStaleMcpSession(sessionId, transports)) {
                recordX402Event({
                    event_type: "discovery",
                    tool: "_session_stale",
                    client_source: String(req.headers["user-agent"] || "")
                        .slice(0, 180),
                    detail: `stale:${String(sessionId).slice(0, 36)}`,
                });
                respondStaleSession(res, String(sessionId));
                return;
            }

            if (sessionId && transports.has(sessionId)) {
                const transport = transports.get(sessionId);
                if (!(transport instanceof StreamableHTTPServerTransport)) {
                    res.status(400).json({
                        error: "Session uses a different transport (SSE)",
                    });
                    return;
                }
                await transport.handleRequest(req, res, req.body);
                return;
            }

            if (req.method === "POST" && isInitializeRequest(req.body)) {
                const clientName = String(
                    req.body?.params?.clientInfo?.name || "unknown-client",
                ).slice(0, 200);
                recordX402Event({
                    event_type: "discovery",
                    tool: "_server",
                    client_source: clientName,
                    detail: clientName,
                });
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => crypto.randomUUID(),
                    onsessioninitialized: (id) => {
                        transports.set(id, transport);
                        recordSessionCreated();
                        capturePaymentHeader(req, id);
                        sessionClientMeta.set(id, {
                            ip: String(
                                req.headers["x-forwarded-for"] ||
                                    req.socket?.remoteAddress ||
                                    "",
                            ).split(",")[0],
                            userAgent: String(req.headers["user-agent"] || ""),
                        });
                        registerSessionClient(
                            sessionClientKeys,
                            id,
                            clientKeyFromHttpRequest(req),
                        );
                    },
                });
                transport.onclose = () => {
                    if (transport.sessionId) {
                        transports.delete(transport.sessionId);
                        sessionPayments.delete(transport.sessionId);
                        sessionClientMeta.delete(transport.sessionId);
                        removeSessionClient(sessionClientKeys, transport.sessionId);
                        recordSessionClosed("streamable_transport_close");
                    }
                };
                const server = createMcpServer();
                await server.connect(transport);
                await transport.handleRequest(req, res, req.body);
                return;
            }

            res.status(400).json({
                error: "Initialize MCP with POST /mcp/protocol (Streamable HTTP)",
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[MCP Signal] protocol error:", message);
            if (!res.headersSent) {
                res.status(500).json({ error: "mcp_internal_error", message });
            }
        }
    });

    // Legacy SSE (public path /mcp/messages for client POST)
    app.get("/sse", async (req, res) => {
        const sseSource = `sse:${String(req.headers["user-agent"] || "").slice(0, 180)}`;
        recordX402Event({
            event_type: "discovery",
            tool: "_server",
            client_source: sseSource,
            detail: sseSource,
        });
        const server = createMcpServer();
        const transport = new SSEServerTransport("/mcp/messages", res);
        transports.set(transport.sessionId, transport);
        res.on("close", () => {
            transports.delete(transport.sessionId);
            sessionPayments.delete(transport.sessionId);
            recordSessionClosed("sse_connection_close");
        });
        await server.connect(transport);
    });

    app.post("/messages", async (req, res) => {
        const sessionId = String(req.query.sessionId || "");
        capturePaymentHeader(req, sessionId);
        const transport = transports.get(sessionId);
        if (!(transport instanceof SSEServerTransport)) {
            if (sessionId) {
                recordX402Event({
                    event_type: "discovery",
                    tool: "_session_stale",
                    client_source: "sse_messages",
                    detail: `stale_sse:${sessionId.slice(0, 36)}`,
                });
                respondStaleSession(res, sessionId);
                return;
            }
            res.status(400).json({ error: "Unknown or expired MCP SSE sessionId" });
            return;
        }
        await transport.handlePostMessage(req, res, req.body);
    });

    console.log(
        `[MCP Terminal] hypernatt-terminal v${TERMINAL_VERSION} — 5 tools`,
    );
    console.log(
        `[MCP Terminal] x402 get_liq_radar @ $${LIQ_RADAR_X402.priceUsdc} → ${LIQ_RADAR_X402.payTo}`,
    );
    console.log("[MCP Terminal] SSE: /sse + /messages | Streamable: /protocol");
}
