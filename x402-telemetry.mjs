/**
 * F#32N — x402 funnel telemetry client (mcp-server container).
 *
 * The MCP container has no Postgres access: events are forwarded to
 * m2m-service via the internal endpoint. Fire-and-forget + fail-open —
 * telemetry must NEVER slow down or break a tool call.
 */
import axios from "axios";
import bs58 from "bs58";

const M2M_URL = process.env.M2M_SERVICE_URL || "http://m2m-service:8010";
const INTERNAL_SECRET =
    process.env.M2M_INTERNAL_SECRET ||
    "";
const TELEMETRY_ENABLED = process.env.M2M_X402_TELEMETRY_ENABLED !== "false";

/**
 * Extract the payer wallet from an x402 payment payload.
 * EVM (EIP-3009 exact) nests it under payload.authorization.from -> lowercased.
 * F#68O — Solana (SVM) fallback: base58 payer, CASE PRESERVED (lowercasing a
 * base58 address corrupts it). Best-effort across common payer fields.
 */
const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isSolWallet(v) {
    return typeof v === "string" && SOLANA_WALLET_RE.test(v.trim());
}

/**
 * Extract payer wallet from a base64-encoded Solana transaction (Versioned v0 or Legacy).
 * In Solana, accounts[0] is fee payer. If an expected fee payer (sponsor) is known
 * and there are multiple signers, the buyer is the first non-fee-payer signer.
 * Never throws: returns null on invalid/corrupted payloads.
 */
export function extractSolanaPayerFromTx(txBase64, expectedFeePayer) {
    try {
        if (!txBase64 || typeof txBase64 !== "string") return null;
        const buf = Buffer.from(txBase64, "base64");
        if (buf.length < 65) return null;

        let offset = 0;
        let numSignatures = 0;
        let shift = 0;
        while (true) {
            if (offset >= buf.length) return null;
            const b = buf[offset++];
            numSignatures |= (b & 0x7f) << shift;
            shift += 7;
            if ((b & 0x80) === 0) break;
            if (shift > 21) return null;
        }

        const sigLen = numSignatures * 64;
        if (offset + sigLen >= buf.length) return null;
        offset += sigLen;

        if (offset >= buf.length) return null;
        // v0 versioned message prefix (0x80 bit set)
        if ((buf[offset] & 0x80) !== 0) {
            offset += 1;
        }

        if (offset + 3 > buf.length) return null;
        const numRequiredSignatures = buf[offset++];
        // skip numReadonlySignedAccounts and numReadonlyUnsignedAccounts
        offset += 2;

        if (numRequiredSignatures === 0) return null;

        let numAccounts = 0;
        shift = 0;
        while (true) {
            if (offset >= buf.length) return null;
            const b = buf[offset++];
            numAccounts |= (b & 0x7f) << shift;
            shift += 7;
            if ((b & 0x80) === 0) break;
            if (shift > 21) return null;
        }

        if (numAccounts < numRequiredSignatures) return null;
        if (offset + numAccounts * 32 > buf.length) return null;

        const encode = bs58.encode || (bs58.default && bs58.default.encode);
        if (typeof encode !== "function") return null;

        const signers = [];
        for (let i = 0; i < numRequiredSignatures; i++) {
            const k = buf.subarray(offset + i * 32, offset + (i + 1) * 32);
            signers.push(encode(k));
        }

        if (signers.length === 0) return null;
        if (expectedFeePayer && signers.length > 1) {
            const nonFee = signers.find((s) => s !== expectedFeePayer);
            if (nonFee && isSolWallet(nonFee)) return nonFee;
        }
        return isSolWallet(signers[0]) ? signers[0] : null;
    } catch {
        return null;
    }
}

export function extractPayerWallet(paymentPayload, expectedFeePayer) {
    if (!paymentPayload || typeof paymentPayload !== "object") return null;
    const direct =
        paymentPayload.from || paymentPayload.payer || paymentPayload.sender;
    if (typeof direct === "string" && /^0x[0-9a-fA-F]{40}$/.test(direct)) {
        return direct.toLowerCase();
    }
    const auth = paymentPayload.payload?.authorization;
    if (auth && typeof auth.from === "string" && /^0x[0-9a-fA-F]{40}$/.test(auth.from)) {
        return auth.from.toLowerCase();
    }
    // Solana fallback (case preserved).
    const nested = paymentPayload.payload || {};
    const cands = [
        paymentPayload.from,
        paymentPayload.payer,
        paymentPayload.sender,
        paymentPayload.account,
        paymentPayload.authority,
        paymentPayload.owner,
        nested.from,
        nested.payer,
        nested.account,
        auth?.from,
    ];
    for (const c of cands) {
        if (isSolWallet(c)) return c;
    }

    // Extract from Solana transaction blob if present (Versioned v0 or Legacy base64)
    const feePayer =
        expectedFeePayer ||
        (typeof paymentPayload.accepted?.extra?.feePayer === "string" ? paymentPayload.accepted.extra.feePayer : null) ||
        (typeof paymentPayload.extra?.feePayer === "string" ? paymentPayload.extra.feePayer : null) ||
        (typeof nested.extra?.feePayer === "string" ? nested.extra.feePayer : null);

    const txBlob =
        (typeof nested.transaction === "string" && nested.transaction) ||
        (typeof paymentPayload.transaction === "string" && paymentPayload.transaction) ||
        null;

    if (txBlob) {
        const solPayer = extractSolanaPayerFromTx(txBlob, feePayer);
        if (solPayer) return solPayer;
    }

    return null;
}

/**
 * F#68O — which rail the buyer used (CAIP-2). The MCP path passes
 * paymentPayload.accepted (the chosen requirement) to verify/settle, so the
 * network lives there; fall back to a top-level network field. Null if unknown.
 */
export function networkFromPayload(paymentPayload) {
    if (!paymentPayload || typeof paymentPayload !== "object") return null;
    const accepted = paymentPayload.accepted;
    if (accepted && typeof accepted.network === "string") return accepted.network;
    if (typeof paymentPayload.network === "string") return paymentPayload.network;
    return null;
}

/**
 * Record a funnel event. Never throws, never blocks.
 * event_type: discovery | 402_shown | payment_invalid | payment_verified | payment_settled
 */
export function recordX402Event(event) {
    if (!TELEMETRY_ENABLED || !INTERNAL_SECRET) return;
    const url = `${M2M_URL.replace(/\/$/, "")}/api/m2m/internal/x402-event`;
    axios
        .post(
            url,
            {
                transport: "mcp",
                ...event,
            },
            {
                headers: {
                    "X-M2M-Internal-Secret": INTERNAL_SECRET,
                    "Content-Type": "application/json",
                },
                timeout: 5000,
            },
        )
        .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[F#32N] telemetry post failed (fail-open): ${message}`);
        });
}
