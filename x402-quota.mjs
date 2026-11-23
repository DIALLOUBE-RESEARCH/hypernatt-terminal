/**
 * F#40N — paywall bypass precheck/consume (mcp-server -> m2m-service).
 * F#43N — forward ip/ua for client_key fallback.
 */
import axios from "axios";

const M2M_URL = process.env.M2M_SERVICE_URL || "http://m2m-service:8010";
const INTERNAL_SECRET =
    process.env.M2M_INTERNAL_SECRET ||
    "";

function normalizeWallet(wallet) {
    if (typeof wallet !== "string") return null;
    const w = wallet.trim().toLowerCase();
    return /^0x[a-f0-9]{40}$/.test(w) ? w : null;
}

async function internalPost(path, body) {
    if (!INTERNAL_SECRET) return null;
    try {
        const res = await axios.post(
            `${M2M_URL.replace(/\/$/, "")}${path}`,
            body,
            {
                headers: {
                    "X-M2M-Internal-Secret": INTERNAL_SECRET,
                    "Content-Type": "application/json",
                },
                timeout: 3000,
            },
        );
        return res.data;
    } catch {
        return null;
    }
}

/**
 * @deprecated use checkPaywallPrecheck
 */
export async function checkQuotaBypass(wallet, tool) {
    const data = await internalPost("/api/m2m/internal/quota/precheck", {
        wallet,
        tool,
    });
    return data?.bypass === true;
}

export async function checkPaywallPrecheck({
    wallet,
    tool,
    symbol,
    mcpClientId,
    hasPayment,
    ip,
    userAgent,
}) {
    const data = await internalPost("/api/m2m/internal/paywall/precheck", {
        wallet: wallet || undefined,
        tool,
        symbol,
        mcp_client_id: mcpClientId || undefined,
        has_payment: Boolean(hasPayment),
        ip: ip || undefined,
        user_agent: userAgent || undefined,
    });
    if (!data) {
        return {
            allow: false,
            defer: false,
            clientKey: null,
            paywallUnavailable: true,
        };
    }
    return {
        allow: data.allow === true,
        defer: data.defer === true,
        clientKey: data.client_key || null,
        cost: data.cost ?? 0,
        paywallUnavailable: false,
    };
}

export async function consumePaywall({
    wallet,
    tool,
    symbol,
    clientKey,
    signalPayload,
    ip,
    userAgent,
    mcpClientId,
}) {
    const data = await internalPost("/api/m2m/internal/paywall/consume", {
        wallet: wallet || undefined,
        tool,
        symbol,
        client_key: clientKey || undefined,
        signal_payload: signalPayload || undefined,
        transport: "mcp",
        mcp_client_id: mcpClientId || undefined,
        ip: ip || undefined,
        user_agent: userAgent || undefined,
    });
    if (!data) {
        return { consumed: false, hold_free: false, paywallUnavailable: true };
    }
    return {
        consumed: data.consumed === true,
        hold_free: data.hold_free === true,
        method: data.method || null,
        cost: data.cost ?? 0,
        paywallUnavailable: false,
    };
}
