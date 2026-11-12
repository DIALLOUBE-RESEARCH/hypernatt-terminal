/**
 * F#636 step 1 — free, read-only MCP tool: the sealed Hyperliquid L2 archive catalog.
 * Returns /api/datasets/catalog unchanged (same source as the HTTP API), plus source_url.
 */
import axios from "axios";
import { toolDescriptionFromCard } from "./server-card-tools.mjs";

export const L2_ARCHIVE_CATALOG_TOOL = "get_l2_archive_catalog";

export function datasetsCatalogUrl(env = process.env) {
    return String(env.DATASETS_CATALOG_URL || "https://hypernatt.com/api/datasets/catalog");
}

function textResult(obj, isError = false) {
    return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }], isError };
}

/** PRE: url answers JSON. POST: the catalog unchanged + source_url; isError on any failure (never invented data). */
export async function fetchL2ArchiveCatalog(url, get = axios.get) {
    try {
        const response = await get(url, { timeout: 10000, headers: { Accept: "application/json" } });
        const data = response?.data;
        if (!data || typeof data !== "object" || data.ok !== true) {
            return textResult({ error: "catalog_unavailable", source_url: url }, true);
        }
        return textResult({ ...data, source_url: url });
    } catch (err) {
        return textResult({ error: "catalog_unavailable", message: String(err?.message || err).slice(0, 200), source_url: url }, true);
    }
}

export function registerL2ArchiveCatalogTool(server, { url = datasetsCatalogUrl(), get } = {}) {
    server.registerTool(
        L2_ARCHIVE_CATALOG_TOOL,
        {
            title: "Hyperliquid L2 archive catalog",
            description: toolDescriptionFromCard(
                L2_ARCHIVE_CATALOG_TOOL,
                "Free, read-only. Catalog of the sealed historical Hyperliquid L2 archive (BTC, ETH): coverage, files, SHA-256, free sample, offers and purchase endpoints.",
            ),
            inputSchema: {},
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
        },
        async () => fetchL2ArchiveCatalog(url, get),
    );
}
