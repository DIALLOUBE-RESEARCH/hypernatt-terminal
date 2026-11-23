/**
 * F#36N / F#37N — beta bypass + post-call hooks (mcp-server → m2m-service).
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

/**
 * Returns true when wallet is beta-grandfathered (free Decision Core).
 */
export async function checkBetaBypass(wallet, tool) {
    const w = normalizeWallet(wallet);
    if (!w || !INTERNAL_SECRET) return false;
    try {
        const res = await axios.post(
            `${M2M_URL.replace(/\/$/, "")}/api/m2m/internal/beta/precheck`,
            { wallet: w, tool },
            {
                headers: {
                    "X-M2M-Internal-Secret": INTERNAL_SECRET,
                    "Content-Type": "application/json",
                },
                timeout: 3000,
            },
        );
        return res.data?.bypass === true;
    } catch {
        return false;
    }
}

/**
 * Record successful tool call for enroll + demand ledger. Fail-open.
 */
export function recordBetaPostCall({
    wallet,
    tool,
    outcome = "ok",
    price_usdc = null,
    session_id = null,
    is_probe = false,
}) {
    const w = normalizeWallet(wallet);
    if (!INTERNAL_SECRET) return;
    axios
        .post(
            `${M2M_URL.replace(/\/$/, "")}/api/m2m/internal/beta/post-call`,
            {
                wallet: w,
                tool,
                transport: "mcp",
                outcome,
                price_usdc,
                session_id,
                is_probe,
            },
            {
                headers: {
                    "X-M2M-Internal-Secret": INTERNAL_SECRET,
                    "Content-Type": "application/json",
                },
                timeout: 5000,
            },
        )
        .catch(() => {});
}
