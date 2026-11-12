/**
 * F#43N — agent-readable MCP payment errors (MCP server mirror of lib/agent-payment-error.ts).
 * F#136 — daily_cap is 0 when the pool kill-switch is off.
 */

import { terminalTrialPolicy, trialSymbol } from "./terminal-trial-policy.mjs";

const FREE_TOOLS_ALWAYS_WORK = [
    "get_agent_manifest",
    "swap_via_nattswap",
];

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

function humanMessage({ reasonCode, tool, creditsRemaining, dailyCap: cap }) {
    const daily = cap ?? advertisedFreeDailyCap();
    const rem = creditsRemaining ?? 0;
    if (reasonCode === "PAYWALL_UNAVAILABLE") {
        return (
            "HyperNatt paywall check is temporarily unavailable. " +
            "Free tools get_agent_manifest and swap_via_nattswap still work — retry in a minute."
        );
    }
    if (reasonCode === "PAYMENT_REQUIRED") {
        return (
            `Payment required for ${tool}. ` +
            "Connect a wallet with swap quota, Agent Pass ($5/mo), or pay $0.001 USDC per call on Base or Solana."
        );
    }
    if (daily <= 0) {
        return (
            "No daily credit pool. No intro slot is available for this tool and requested symbol today (or intro access is unavailable). Inspect trial_policy_v2 and remaining slots with get_agent_manifest on this MCP connection. " +
            "Pay $0.001 USDC via x402 on Base or Solana. " +
            "get_agent_manifest and swap_via_nattswap still work."
        );
    }
    return (
        `Free trial credits used (${rem}/${daily} pool remaining today UTC). ` +
        "get_agent_manifest and swap_via_nattswap still work. " +
        "Swap via NattSwap for bonus credits, Agent Pass $5/mo, or retry tomorrow UTC."
    );
}

export function buildAgentPaymentRequiredBlock(input) {
    const daily = input.dailyCap ?? advertisedFreeDailyCap();
    const swapTool =
        input.tool === "swap_quote" || input.tool === "swap_via_nattswap";
    const nextSteps = swapTool
        ? [
              "Call get_agent_manifest and read wallet_onboarding_v1 under Execution",
              "Use swap_via_nattswap MCP with YOUR agent wallet as fromAddress (not a vault address)",
              "https://github.com/DIALLOUBE-RESEARCH/hypernatt-terminal/blob/main/docs/swap-agentkit.md",
              "After on-chain swap: POST /api/m2m/swap/register for quota credits",
          ]
        : [
              "Call get_agent_manifest on the SAME MCP connection for trial_policy_v2, per-symbol free_tier_status_v1 and pricing. Zero daily_cap is the separate pool, not a global trial count.",
              "Register a NattSwap to earn bonus credits",
              "Retry tomorrow UTC or pass x_payment for paygo",
          ];
    return {
        version: "1",
        reason_code: input.reasonCode,
        human_message_en: humanMessage({ ...input, dailyCap: daily }),
        tool: input.tool,
        requested_symbol: trialSymbol(input.tool, input.symbol),
        trial_policy_v2: terminalTrialPolicy(),
        credits_remaining: input.creditsRemaining ?? 0,
        daily_cap: daily,
        intro_free_available: input.introFreeAvailable ?? {},
        free_tools_always_work: FREE_TOOLS_ALWAYS_WORK,
        next_steps_en: nextSteps,
    };
}

export function enrichPaymentRequiredPayload(base, input) {
    if (process.env.MCP_AGENT_PAYMENT_ERROR_V1_ENABLED === "false") {
        return base;
    }
    return {
        agent_payment_required_v1: buildAgentPaymentRequiredBlock(input),
        ...base,
    };
}
