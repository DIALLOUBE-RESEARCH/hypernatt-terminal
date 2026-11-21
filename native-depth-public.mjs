import axios from "axios";
import { z } from "zod";
import { createDataProductX402 } from "./x402-data-products.mjs";
import { NATIVE_DEPTH_TOOL, nativeDepthEnabled } from "./native-depth-catalog.mjs";

export const nativeDepthSchema = z.object({
  symbol: z.enum(["BTC", "ETH"]).describe("BTC or ETH only."),
  side: z.enum(["buy", "sell"]),
  quantity_base: z.string().max(96).regex(/^-?[0-9]+(?:\.[0-9]+)?$/).describe("Token base units, not USDC."),
  lookback_s: z.union([z.literal(30), z.literal(300)]).optional().describe("Fixed-price wall history and observed flow window, 30 or 300 seconds; default 300."),
  x_payment: z.string().max(100000).optional().describe("x402 Base or Solana payment. Omit first to discover 402."),
  agent_wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Optional wallet for credits. Never a private key."),
}).strict();

function result(value, error = false) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, ...(error ? { isError: true } : {}) };
}

/**
 * F#654 — measured 20/11 (300 preparations, 10 min): the readable same-time book refreshes about every 12.4 s and
 * sometimes skips one (24.9 s), while the freshness window is 15 s, so ~15 % of calls met a stale book (503).
 * A preparation that fails ONLY because the book is too old now waits for the next recorded book, before any
 * payment: a new preparation every FRESH_POLL_MS, for at most FRESH_WAIT_MS (longest measured wait 14.4 s +
 * one poll + one slow preparation). Any other error is never retried.
 */
export const STALE_LIMIT_MS = 15000;
export const FRESH_WAIT_MS = 20000;
export const FRESH_POLL_MS = 2000;

export function isStaleOnly(response, now = Date.now()) {
  if (response?.ok === false) return response.error === 'native_depth_stale';
  const bookTime = response?.result?.quality?.book_time_ms;
  return response?.ok === true && Number.isSafeInteger(bookTime) && now - bookTime > STALE_LIMIT_MS;
}

export function pauseUnlessAborted(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('cancelled'));
    const onAbort = () => { clearTimeout(timer); reject(new Error('cancelled')); };
    const timer = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

export function assertNativeDepthPrepared(response, now = Date.now()) {
  const value = response?.result;
  const quality = value?.quality;
  const age = now - quality?.book_time_ms;
  const views = value?.liquidity_map?.views;
  if (response?.ok !== true || response.product !== 'hypernatt_native_depth_v1' ||
      value?.ok !== true || value.feature_version !== 'market_context_v2' ||
      value.schema_version !== 'hypernatt_native_depth_v2' || value.source !== 'recorder_REF' ||
      value.not_a_signal !== true || quality?.source_kind !== 'recorded_market_data' ||
      quality.evaluation_mode !== 'live' || quality.stale !== false ||
      !Number.isSafeInteger(quality.book_time_ms) || age < -250 || age > STALE_LIMIT_MS ||
      !Array.isArray(views) || views.length !== 4 ||
      views.some((view, i) => view.view !== ['REF', 'M2', 'M5', 'AGG4'][i] || view.book_time_ms !== quality.book_time_ms)) {
    throw new Error('native_depth_unavailable');
  }
}

export function withNativeDepthDelivery(response, now = Date.now()) {
  const original = response.result;
  const age = now - original.quality.book_time_ms;
  const expired = !Number.isFinite(age) || age < -250 || age > 15000;
  return { ...response, result: { ...original,
    quality: { ...original.quality, age_ms: age, stale: expired,
      evaluation_mode: expired ? 'expired_after_payment' : 'live' },
    delivery: { delivered_at_ms: now, within_age_window: !expired,
      status: expired ? 'snapshot_expired_during_payment' : 'recent_recorded_snapshot' },
  } };
}

export function registerNativeDepthTool(server, ctx) {
  const product = createDataProductX402({
    toolName: NATIVE_DEPTH_TOOL.name,
    description: NATIVE_DEPTH_TOOL.description,
    priceEnv: "LIQ_RADAR_X402_PRICE_USDC",
    payToEnv: "MIMO_SIGNAL_X402_PAYTO",
    internalPath: "/api/m2m/internal/native-depth",
    resourceUrl: ctx.resourceUrl,
  });
  server.registerTool(NATIVE_DEPTH_TOOL.name, {
    description: `${NATIVE_DEPTH_TOOL.description} Price: 0.001 USDC/call via existing x402 Base/Solana or eligible credits.`,
    inputSchema: nativeDepthSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (input, extra) => {
    if (!nativeDepthEnabled()) return result({ ok: false, error: "native_depth_disabled" }, true);
    if (!ctx.internalSecret) return result({ ok: false, error: "native_depth_unavailable" }, true);
    const { x_payment, agent_wallet, ...args } = input;
    let prepared;
    const prepareOnce = async () => ctx.prepare ? await ctx.prepare(args, extra.signal) : (await axios.post(
      `${ctx.m2mUrl.replace(/\/$/, "")}/api/m2m/internal/native-depth`,
      args,
      {
        headers: { "X-M2M-Internal-Secret": ctx.internalSecret },
        timeout: 8000,
        signal: extra.signal,
        maxBodyLength: 1024 * 1024,
        maxContentLength: 2 * 1024 * 1024,
        validateStatus: () => true,
      },
    )).data;
    const beforeCharge = async () => {
      if (prepared) return;
      if (extra.signal?.aborted) throw new Error("cancelled");
      const waitMs = ctx.freshWaitMs ?? FRESH_WAIT_MS;
      const pollMs = ctx.freshPollMs ?? FRESH_POLL_MS;
      const deadline = Date.now() + waitMs;
      let response = await prepareOnce();
      // F#654: only an expired book is worth waiting for; the next recorded one arrives within the window.
      while (isStaleOnly(response) && Date.now() + pollMs <= deadline) {
        await pauseUnlessAborted(pollMs, extra.signal);
        response = await prepareOnce();
      }
      if (extra.signal?.aborted) throw new Error("cancelled");
      if (response?.error === "unsupported_symbol" || response?.error === "invalid_request") {
        const err = new Error(response.error);
        err.code = response.error;
        throw err;
      }
      assertNativeDepthPrepared(response);
      prepared = response;
    };
    try {
      const payment = await ctx.pay({
        tool: NATIVE_DEPTH_TOOL.name,
        priceUsdc: product.priceUsdc,
        symbol: args.symbol,
        paymentRaw: x_payment || ctx.sessionPayment?.(extra.sessionId),
        agent_wallet,
        sessionId: extra.sessionId,
        parse: product.parsePaymentHeader,
        verify: product.verifyPayment,
        buildRequired: product.buildPaymentRequired,
        buildRequirements: product.buildPaymentRequirements,
        beforeCharge,
      });
      if (payment.errorResult) return payment.errorResult;
      if (!payment.ok || !prepared) return result({ ok: false, error: "native_depth_not_prepared" }, true);
      try {
        ctx.record?.({ ...payment, wallet: payment.wallet, tool: NATIVE_DEPTH_TOOL.name, priceUsdc: product.priceUsdc, sessionId: extra.sessionId });
      } catch { /* telemetry never blocks */ }
      return result(withNativeDepthDelivery(prepared));
    } catch (error) {
      const code = error?.code || error?.message || "native_depth_unavailable";
      const http = error?.response?.status;
      if (http === 400 || code === "unsupported_symbol" || code === "invalid_request") {
        return result({ ok: false, error: code, message: "Native depth rejected this request. No payment was taken." }, true);
      }
      return result({ ok: false, error: code === "data_unavailable" ? "native_depth_unavailable" : code, message: "Native depth could not be prepared. No result was released." }, true);
    }
  });
}
