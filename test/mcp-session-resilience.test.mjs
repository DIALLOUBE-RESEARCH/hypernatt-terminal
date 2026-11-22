import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    bindActiveSessionCounter,
    buildStaleSessionBody,
    isStaleMcpSession,
    recordSessionClosed,
    recordSessionCreated,
    recordStaleSessionRejected,
    resetMcpSessionStatsForTests,
    staleSessionHttpStatus,
    getMcpSessionStats,
    DEFAULT_SESSION_IDLE_MS,
    findIdleSessions,
    sessionIdleMsFromEnv,
    touchSession,
} from "../mcp-session-resilience.mjs";

describe("mcp-session-resilience.mjs F#45N", () => {
    it("detects stale session when id missing from transports map", () => {
        const transports = new Map([["live-id", {}]]);
        assert.equal(isStaleMcpSession("live-id", transports), false);
        assert.equal(isStaleMcpSession("dead-id", transports), true);
        assert.equal(isStaleMcpSession("", transports), false);
        assert.equal(isStaleMcpSession(undefined, transports), false);
    });

    it("returns 404 status per MCP spec", () => {
        assert.equal(staleSessionHttpStatus(), 404);
    });

    it("builds agent-friendly stale body with reinitialize action", () => {
        const body = buildStaleSessionBody("abc12345-dead-beef");
        assert.equal(body.code, "MCP_SESSION_STALE");
        assert.equal(body.action, "reinitialize");
        assert.equal(body.session_id_prefix, "abc12345");
    });

    it("tracks lifecycle counters", () => {
        resetMcpSessionStatsForTests();
        bindActiveSessionCounter(() => 2);
        recordSessionCreated();
        recordSessionClosed("transport_close");
        recordStaleSessionRejected();
        const snap = getMcpSessionStats();
        assert.equal(snap.sessions_active, 2);
        assert.equal(snap.sessions_created_total, 1);
        assert.equal(snap.sessions_closed_total, 1);
        assert.equal(snap.stale_rejected_total, 1);
        assert.equal(snap.close_reasons.transport_close, 1);
    });
});

describe("idle session sweep (health report 22/11/2026)", () => {
    it("finds only sessions idle longer than the timeout", () => {
        const last = new Map();
        touchSession(last, "old", 1_000);
        touchSession(last, "fresh", 1_000 + DEFAULT_SESSION_IDLE_MS);
        touchSession(last, "", 0);
        touchSession(last, undefined, 0);
        assert.deepEqual(findIdleSessions(last, 2_000 + DEFAULT_SESSION_IDLE_MS, DEFAULT_SESSION_IDLE_MS), ["old"]);
        assert.equal(last.size, 2);
    });

    it("a new request resets the idle clock", () => {
        const last = new Map();
        touchSession(last, "s", 0);
        touchSession(last, "s", DEFAULT_SESSION_IDLE_MS);
        assert.deepEqual(findIdleSessions(last, DEFAULT_SESSION_IDLE_MS + 1, DEFAULT_SESSION_IDLE_MS), []);
    });

    it("reads MCP_SESSION_IDLE_MINUTES within 5..1440, else 30 minutes", () => {
        assert.equal(sessionIdleMsFromEnv({}), 30 * 60 * 1000);
        assert.equal(sessionIdleMsFromEnv({ MCP_SESSION_IDLE_MINUTES: "abc" }), 30 * 60 * 1000);
        assert.equal(sessionIdleMsFromEnv({ MCP_SESSION_IDLE_MINUTES: "1" }), 5 * 60 * 1000);
        assert.equal(sessionIdleMsFromEnv({ MCP_SESSION_IDLE_MINUTES: "90" }), 90 * 60 * 1000);
        assert.equal(sessionIdleMsFromEnv({ MCP_SESSION_IDLE_MINUTES: "99999" }), 24 * 60 * 60 * 1000);
    });

    it("counts idle closures under their own reason", () => {
        resetMcpSessionStatsForTests();
        recordSessionClosed("idle_timeout");
        const snap = getMcpSessionStats();
        assert.equal(snap.close_reasons.idle_timeout, 1);
        assert.equal(snap.idle_timeout_minutes, sessionIdleMsFromEnv() / 60000);
    });
});
