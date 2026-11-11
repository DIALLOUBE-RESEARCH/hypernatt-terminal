# Agent skills (agentskills.io)

Optional onboarding skills for agent runtimes (Hermes Agent, OpenClaw via ClawHub, Bankr, etc.).

| Skill | Path | Purpose |
|-------|------|---------|
| **hypernatt-liq-radar** | [hypernatt-liq-radar/SKILL.md](hypernatt-liq-radar/SKILL.md) | **Trading-first** — call get_liq_radar before sizing/entering a perp |
| **hypernatt-terminal** | [hypernatt-terminal/SKILL.md](hypernatt-terminal/SKILL.md) | Full MCP onboarding (5 tools + x402 wallet) |

Current journeys: [native depth](../docs/native-depth.md), [liquidation terrain](../docs/agent-liq-radar-loop.md), and [swap](../docs/agent-swap-demo.md).

## Install (Hermes)

```bash
hermes skills install github/DIALLOUBERESEARCH/hypernatt-terminal/skills/hypernatt-liq-radar
hermes skills install github/DIALLOUBERESEARCH/hypernatt-terminal/skills/hypernatt-terminal
```

## Install (OpenClaw / ClawHub)

After mirror sync + `clawhub login`:

```bash
clawhub skill publish ./skills/hypernatt-liq-radar --slug hypernatt-liq-radar --name "HyperNatt Liq Radar" --version 1.0.0
openclaw skills install hypernatt-liq-radar
```

For connector configuration, use the examples in [integrations.md](../docs/integrations.md). The YAML front matter in `SKILL.md` describes the skill; it is not an `mcp_servers` configuration.

## MCP without a skill

The MCP server works without installing any skill — add the connector URL only:

`https://hypernatt.com/mcp/protocol`

See [docs/integrations.md](../docs/integrations.md) and [docs/quickstart.md](../docs/quickstart.md).
