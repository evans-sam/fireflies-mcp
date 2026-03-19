# Fireflies MCP Server & CLI

MCP server and CLI for the [Fireflies.ai](https://fireflies.ai) API. Retrieve transcripts, search meetings, and generate summaries.

> Forked from [Props-Labs/fireflies-mcp](https://github.com/Props-Labs/fireflies-mcp).

## Quick Start

```bash
# Install globally
npm install -g fireflies-mcp
# or
bun install -g fireflies-mcp

# Set your API key
export FIREFLIES_API_KEY=your_key

# Use the CLI
fireflies-mcp transcripts --limit 5
fireflies-mcp search "standup" --json
fireflies-mcp details <transcript-id>
fireflies-mcp summary <transcript-id>
```

## Commands

```
fireflies-mcp                              Start MCP server (stdio, default)
fireflies-mcp serve                        Start MCP server (stdio, explicit)
fireflies-mcp serve --http [--port 3000]   Start MCP HTTP server
fireflies-mcp transcripts [options]        List recent transcripts
fireflies-mcp details <id> [options]       Get transcript details
fireflies-mcp search <query> [options]     Search transcripts by title
fireflies-mcp summary <id> [options]       Generate transcript summary
fireflies-mcp --help                       Show help
fireflies-mcp --version                    Show version
```

### CLI Options

| Option | Applies to | Description |
|---|---|---|
| `--json` | all CLI commands | Output raw JSON instead of formatted text |
| `--limit <n>` | transcripts, search | Maximum results (default: 20) |
| `--from <date>` | transcripts, search | Start date filter (YYYY-MM-DD) |
| `--to <date>` | transcripts, search | End date filter (YYYY-MM-DD) |
| `--format <fmt>` | summary | `bullet_points` (default) or `paragraph` |

## MCP Tools

When running as an MCP server, exposes these tools:

1. **`fireflies_get_transcripts`** — List transcripts with optional date/limit filters
2. **`fireflies_get_transcript_details`** — Full transcript with speakers, text, and summary
3. **`fireflies_search_transcripts`** — Search by title keyword
4. **`fireflies_generate_summary`** — Summary in bullet points or paragraph format

## Installation

### Option 1: npx (no install)

```bash
npx fireflies-mcp transcripts --limit 5
```

### Option 2: Global install

```bash
npm install -g fireflies-mcp
# or
bun install -g github:evans-sam/fireflies-mcp
```

### Option 3: From source

```bash
git clone https://github.com/evans-sam/fireflies-mcp.git
cd fireflies-mcp
bun install
```

## MCP Server Configuration

### Claude Code (`~/.claude.json`)

**Via npx (Node.js):**
```json
{
  "mcpServers": {
    "fireflies": {
      "command": "npx",
      "args": ["fireflies-mcp"],
      "env": { "FIREFLIES_API_KEY": "<YOUR_API_KEY>" }
    }
  }
}
```

**Via Bun (from source):**
```json
{
  "mcpServers": {
    "fireflies": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/fireflies-mcp/src/main.ts"],
      "env": { "FIREFLIES_API_KEY": "<YOUR_API_KEY>" }
    }
  }
}
```

**Via Docker (HTTP):**
```json
{
  "mcpServers": {
    "fireflies": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Claude Desktop

Same JSON structure — add to `claude_desktop_config.json`.

## Docker

```bash
# docker-compose (recommended)
FIREFLIES_API_KEY=your_key docker compose up -d

# or directly
docker build -t fireflies-mcp .
docker run -d -p 127.0.0.1:3000:3000 -e FIREFLIES_API_KEY=your_key --restart unless-stopped fireflies-mcp

# verify
curl http://localhost:3000/health
```

## Setup

### Fireflies API Key

Get your key at [fireflies.ai/dashboard/settings/api](https://fireflies.ai/dashboard/settings/api).

## Development

```bash
bun install          # Install deps
bun run start        # Start MCP server (stdio)
bun test             # Run tests
bun run lint         # Lint
bun run format       # Format (auto-fix)
bun run build        # Build for Node.js
```

### Publishing

Publishing is automated via GitHub Actions. To release:

```bash
# Bump version in package.json, then:
git tag v0.2.0
git push origin v0.2.0
```

This triggers CI → test → build → npm publish → GitHub release.

Requires `NPM_TOKEN` secret in the repository settings.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FIREFLIES_API_KEY` | Yes | — | Your Fireflies.ai API key |

## License

MIT. See [Props-Labs/fireflies-mcp](https://github.com/Props-Labs/fireflies-mcp) for the original.
