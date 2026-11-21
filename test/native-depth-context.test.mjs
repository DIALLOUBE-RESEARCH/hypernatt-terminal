import test from 'node:test';
import assert from 'node:assert/strict';
import { FRESH_POLL_MS, FRESH_WAIT_MS, STALE_LIMIT_MS, assertNativeDepthPrepared, isStaleOnly, registerNativeDepthTool, withNativeDepthDelivery } from '../native-depth-public.mjs';

function prepared(now = Date.now()) {
  return { ok: true, product: 'hypernatt_native_depth_v1', result: {
    ok: true, source: 'recorder_REF', schema_version: 'hypernatt_native_depth_v2',
    feature_version: 'market_context_v2', not_a_signal: true,
    quality: { source_kind: 'recorded_market_data', evaluation_mode: 'live', stale: false, book_time_ms: now },
    liquidity_map: { views: ['REF', 'M2', 'M5', 'AGG4'].map(view => ({ view, book_time_ms: now })) },
  } };
}

test('freshness boundaries and recorded provenance are enforced', () => {
  const now = 1789714806000;
  for (const age of [-250, 0, 14999, 15000]) assert.doesNotThrow(() => assertNativeDepthPrepared(prepared(now - age), now));
  for (const age of [-251, 15001, 100000]) assert.throws(() => assertNativeDepthPrepared(prepared(now - age), now));
  for (const change of [
    x => { x.result.quality.source_kind = 'fixture'; },
    x => { x.result.quality.stale = true; },
    x => { x.result.quality.evaluation_mode = 'historical'; },
    x => { x.result.feature_version = 'native_depth_v1'; },
    x => { x.result.not_a_signal = false; },
    x => { x.result.liquidity_map.views[1].book_time_ms -= 1; },
    x => { x.result.liquidity_map.views.pop(); },
  ]) { const value = prepared(now); change(value); assert.throws(() => assertNativeDepthPrepared(value, now)); }
});

test('stale and legacy fixture responses cannot consume credit or settlement', async () => {
  for (const response of [prepared(Date.now() - 60000), { ok: true, product: 'hypernatt_native_depth_v1', result: { ok: true } }]) {
    let callback, charges = 0;
    registerNativeDepthTool({ registerTool(_name, _config, handler) { callback = handler; } }, {
      internalSecret: 'mock-internal', prepare: async () => response, freshWaitMs: 50, freshPollMs: 10,
      pay: async ({ beforeCharge }) => { await beforeCharge(); charges++; return { ok: true }; },
    });
    const out = await callback({ symbol: 'ETH', side: 'buy', quantity_base: '1000' }, {});
    assert.equal(out.isError, true);
    assert.equal(charges, 0);
    assert.equal(out.structuredContent.result, undefined);
  }
});

test('fresh preparation is delivered; delayed settlement is labelled expired', async () => {
  let callback, charges = 0;
  registerNativeDepthTool({ registerTool(_name, _config, handler) { callback = handler; } }, {
    internalSecret: 'mock-internal', prepare: async () => prepared(),
    pay: async ({ beforeCharge }) => { await beforeCharge(); charges++; return { ok: true }; },
  });
  const out = await callback({ symbol: 'ETH', side: 'buy', quantity_base: '1000' }, {});
  assert.equal(out.isError, undefined);
  assert.equal(charges, 1);
  assert.equal(out.structuredContent.result.delivery.within_age_window, true);
  const before = prepared(1789714806000);
  const delayed = withNativeDepthDelivery(before, 1789714821001);
  assert.equal(delayed.result.quality.stale, true);
  assert.equal(delayed.result.quality.evaluation_mode, 'expired_after_payment');
  assert.equal(delayed.result.quality.book_time_ms, before.result.quality.book_time_ms);
  assert.equal(before.result.quality.stale, false);
});

// F#654 — wait for the next recorded book instead of answering stale; never charge a stale book.
function tool(responses, options = {}) {
  let callback, charges = 0, calls = 0;
  registerNativeDepthTool({ registerTool(_name, _config, handler) { callback = handler; } }, {
    internalSecret: 'mock-internal', freshWaitMs: 200, freshPollMs: 20, ...options,
    prepare: async () => { const r = responses[Math.min(calls, responses.length - 1)]; calls++; return typeof r === 'function' ? r() : r; },
    pay: async ({ beforeCharge }) => { await beforeCharge(); charges++; return { ok: true }; },
  });
  return { run: (extra = {}) => callback({ symbol: 'ETH', side: 'buy', quantity_base: '1' }, extra), counts: () => ({ charges, calls }) };
}
const STALE = { ok: false, error: 'native_depth_stale', message: 'Recorded book expired' };

test('F#654 constants come from the 20/11 measurement and keep the 15 s promise', () => {
  assert.equal(STALE_LIMIT_MS, 15000);
  assert.equal(FRESH_WAIT_MS, 20000);
  assert.equal(FRESH_POLL_MS, 2000);
  const now = 1789714806000;
  assert.equal(isStaleOnly(STALE, now), true);
  assert.equal(isStaleOnly(prepared(now - 15001), now), true);
  assert.equal(isStaleOnly(prepared(now - 15000), now), false);
  for (const other of [{ ok: false, error: 'native_depth_unavailable' }, { ok: false, error: 'native_depth_oversize' },
    { ok: false, error: 'invalid_book' }, { ok: false, error: 'unsupported_symbol' }, { ok: true, result: { ok: true } }, null, undefined]) {
    assert.equal(isStaleOnly(other, now), false);
  }
});

test('F#654 stale then fresh: waits, delivers a fresh book, charges once', async () => {
  for (const first of [STALE, () => prepared(Date.now() - 15500)]) {
    const t = tool([first, STALE, () => prepared()]);
    const out = await t.run();
    assert.equal(out.isError, undefined);
    assert.deepEqual(t.counts(), { charges: 1, calls: 3 });
    assert.equal(out.structuredContent.result.delivery.within_age_window, true);
  }
});

test('F#654 always stale: bounded attempts, error, never charged', async () => {
  const t = tool([STALE], { freshWaitMs: 100, freshPollMs: 20 });
  const started = Date.now();
  const out = await t.run();
  assert.equal(out.isError, true);
  assert.equal(t.counts().charges, 0);
  assert.ok(t.counts().calls >= 2 && t.counts().calls <= 1 + 100 / 20, `calls ${t.counts().calls}`);
  assert.ok(Date.now() - started < 1000);
  assert.equal(out.structuredContent.result, undefined);
});

test('F#654 any other error is never retried', async () => {
  for (const other of [{ ok: false, error: 'native_depth_oversize' }, { ok: false, error: 'invalid_book' },
    { ok: false, error: 'native_depth_unavailable' }, { ok: true, product: 'hypernatt_native_depth_v1', result: { ok: true } }]) {
    const t = tool([other, () => prepared()]);
    const out = await t.run();
    assert.equal(out.isError, true);
    assert.deepEqual(t.counts(), { charges: 0, calls: 1 });
  }
});

test('F#654 a disconnect during the wait stops everything without charge', async () => {
  const controller = new AbortController();
  const t = tool([STALE, () => prepared()], { freshWaitMs: 5000, freshPollMs: 1000 });
  setTimeout(() => controller.abort(), 30);
  const out = await t.run({ signal: controller.signal });
  assert.equal(out.isError, true);
  assert.equal(out.structuredContent.error, 'cancelled');
  assert.deepEqual(t.counts(), { charges: 0, calls: 1 });
});
