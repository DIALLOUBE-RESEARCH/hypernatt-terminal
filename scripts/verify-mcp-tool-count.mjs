/**
 * Build-time gate: server-card.json must list exactly CANON_4 terminal tools (F377).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cardPath = path.join(root, "server-card.json");

const EXPECTED_COUNT = 5;
const EXPECTED_TOOLS = [
    "get_agent_manifest",
    "get_liq_radar",
    "swap_via_nattswap",
    "get_native_depth",
    "get_l2_archive_catalog",
].sort();

const card = JSON.parse(fs.readFileSync(cardPath, "utf8"));
const names = (card.tools || []).map((t) => t.name).sort();
const version = card.serverInfo?.version || "unknown";

if (version !== "2.10.0") {
    console.error(`[verify-mcp-tool-count] FAIL: version ${version}, expected 2.10.0`);
    process.exit(1);
}

if (names.length !== EXPECTED_COUNT) {
    console.error(
        `[verify-mcp-tool-count] FAIL: server-card has ${names.length} tools, expected ${EXPECTED_COUNT} (v${version})`,
    );
    process.exit(1);
}

const missing = EXPECTED_TOOLS.filter((n) => !names.includes(n));
const extra = names.filter((n) => !EXPECTED_TOOLS.includes(n));
if (missing.length || extra.length) {
    console.error("[verify-mcp-tool-count] FAIL: tool name mismatch");
    if (missing.length) console.error("  missing:", missing.join(", "));
    if (extra.length) console.error("  extra:", extra.join(", "));
    process.exit(1);
}

console.log(
    `[verify-mcp-tool-count] OK: ${EXPECTED_COUNT} tools v${version} — ${names.join(", ")}`,
);
