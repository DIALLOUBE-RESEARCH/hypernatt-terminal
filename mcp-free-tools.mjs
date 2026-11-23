/**
 * Phase 0 — hypernatt-terminal free MCP tools (thin m2m proxy).
 * F99N — MCP surface: swap_via_nattswap only (swap_quote + vault_proof unregistered).
 */
import axios from "axios";
import { z } from "zod";
import { toolDescriptionFromCard } from "./server-card-tools.mjs";
import { validateTerminalSwap, terminalSwapPolicyMode } from "./base-tokens.mjs";

const swapParamsSchema = {
    fromChain: z
        .union([z.number(), z.string()])
        .describe("Source Li.Fi chain id (e.g. 1 Ethereum, 8453 Base, 42161 Arbitrum)"),
    toChain: z
        .union([z.number(), z.string()])
        .describe("Destination Li.Fi chain id"),
    fromToken: z.string().describe("Source token contract address on fromChain"),
    toToken: z.string().describe("Destination token contract address on toChain"),
    fromAmount: z
        .string()
        .describe("Amount in token smallest units (wei for 18-decimal tokens)"),
    fromAddress: z.string().describe("Sender wallet 0x + 40 hex chars"),
    toAddress: z.string().describe("Recipient wallet 0x + 40 hex chars"),
    slippage: z.number().optional().describe("Max slippage percent (e.g. 0.5 for 0.5%)"),
};

function m2mHeaders(internalSecret) {
    return {
        "X-M2M-Internal-Secret": internalSecret,
        Accept: "application/json",
    };
}

async function fetchInternalSwapQuote(m2mUrl, internalSecret, params) {
    const base = m2mUrl.replace(/\/$/, "");
    const response = await axios.get(`${base}/api/m2m/internal/swap/quote`, {
        headers: m2mHeaders(internalSecret),
        params,
        timeout: 30000,
    });
    return response.data;
}

function toolTextResult(obj, isError = false) {
    return {
        content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
        isError,
    };
}

function rejectInvalidSwapParams(params) {
    const err = validateTerminalSwap(params);
    if (err) {
        return toolTextResult(
            {
                error: err,
                pair: "BTC/USDC",
                pair_policy: terminalSwapPolicyMode(),
            },
            true,
        );
    }
    return null;
}

/**
 * Register free swap tool on MCP server (F99N: swap_via_nattswap only).
 */
export function registerTerminalSwapTools(server, ctx) {
    const { m2mUrl, internalSecret } = ctx;

    server.registerTool(
        "swap_via_nattswap",
        {
            description: toolDescriptionFromCard(
                "swap_via_nattswap",
                "Cross-chain swap via Li.Fi with step-by-step agent instructions. Free at MCP layer.",
            ),
            inputSchema: swapParamsSchema,
        },
        async (params) => {
            if (!internalSecret) {
                return toolTextResult({ error: "MCP missing internal secret" }, true);
            }
            const rejected = rejectInvalidSwapParams(params);
            if (rejected) return rejected;
            try {
                const quoted = await fetchInternalSwapQuote(m2mUrl, internalSecret, params);
                const data =
                    quoted && typeof quoted === "object" ? { ...quoted } : quoted;
                if (data && typeof data === "object") {
                    delete data.recommended_action;
                }
                const payload = {
                    ok: true,
                    source: "hypernatt-terminal",
                    data,
                };
                return toolTextResult(payload);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const status = err.response?.status;
                const body = err.response?.data;
                return toolTextResult(
                    { error: "swap_quote_failed", status, message, body },
                    true,
                );
            }
        },
    );
}

/**
 * F99N — no-op: get_vault_proof removed from MCP surface (HTTP demount separate).
 */
export function registerVaultProofTool(_server, _ctx) {
    // intentionally empty — keep export so older call sites do not crash
}
