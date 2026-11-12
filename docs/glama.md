# Glama server submission

Submit at **https://glama.ai/mcp/servers** → **Add Server** (not Connectors).

| Field | Value |
|-------|--------|
| GitHub repo | `https://github.com/DIALLOUBE-RESEARCH/hypernatt-terminal` |
| Dockerfile | `./Dockerfile` (repo root) |
| License | MIT |
| Hosted MCP (optional) | `https://hypernatt.com/mcp/protocol` |
| Quickstart | [docs/quickstart.md](quickstart.md) |

After evaluation:

- Server page: https://glama.ai/mcp/servers/DIALLOUBE-RESEARCH/hypernatt-terminal
- Badge: https://glama.ai/mcp/servers/DIALLOUBE-RESEARCH/hypernatt-terminal/badges/score.svg

Connector (already live, separate): https://glama.ai/mcp/connectors/com.hypernatt/hypernatt-terminal

## Local Docker smoke

```bash
docker build -t hypernatt-terminal .
docker run --rm -p 8011:8011 hypernatt-terminal
curl -sS http://127.0.0.1:8011/health
```

Expected after rebuild: `"version":"2.10.0"`, `"tools":5`, `mcp_sessions_v1` on `GET /health`.

## Re-sync after a version update

The repository README and the sandbox's introspected tool catalog are separate.

1. Publish the reviewed runtime, `public-repo/` documentation and lockfile to the public repository.
2. In Glama **Repository**, use **Sync Server** and check the reported commit against GitHub.
3. In **Dockerfile**, inspect the generated configuration, then build/test the intended commit. A metadata sync alone does not prove a successful build or release.
4. Check build logs, the selected release and its introspected `tools/list`. Current v2.10.0 exposes `get_agent_manifest`, `get_liq_radar`, `swap_via_nattswap`, `get_native_depth`.

## Generated Dockerfile configuration

For the Glama admin form that generates its own Dockerfile (as displayed on 2026-09-14):

| Field | Value |
|-------|--------|
| Build steps | `["npm ci --omit=dev"]` |
| CMD arguments | `["mcp-proxy", "--", "node", "stdio.mjs"]` |
| `GATEWAY_URL` | `https://hypernatt.com` |
| Placeholder parameters | `{}` |
| Pinned commit | A commit recognized by the synced repository; empty uses its current head |

This generated file is different from the repository's Dockerfile used in the local smoke above. Do not omit dependency installation just because the repository has a Dockerfile. Inspect the generated file to confirm the command and installation step.

`server.js` serves the HTTP MCP endpoint and health route. `stdio.mjs` is the stdio adapter used by `mcp-proxy` for sandbox introspection. Production agents connect to `https://hypernatt.com/mcp/protocol`.

If the build fails before dependency installation or startup, diagnose that failing step from the logs. A successful repository sync, build and published release must each be verified; no rebuild duration is guaranteed.
