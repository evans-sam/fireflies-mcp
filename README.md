# Fireflies MCP Server

MCP Server for the [Fireflies.ai](https://fireflies.ai) API, enabling transcript retrieval, search, and summary generation.

> **Attribution:** This project is forked from [Props-Labs/fireflies-mcp](https://github.com/Props-Labs/fireflies-mcp). Thank you to [Props Labs](https://props.app) for building the original MCP server. This fork migrates to Bun, adds HTTP transport for Docker deployment, and removes external dependencies.

### Features

- **Transcript Management**: Retrieve and search meeting transcripts with filtering options
- **Detailed Information**: Get comprehensive details about specific transcripts
- **Advanced Search**: Find transcripts containing specific keywords or phrases
- **Summary Generation**: Generate concise summaries of meeting transcripts in different formats

## Tools

1. `fireflies_get_transcripts`
   - Retrieve a list of meeting transcripts with optional filtering
   - Inputs:
     - `limit` (optional number): Maximum number of transcripts to return
     - `from_date` (optional string): Start date in ISO format (YYYY-MM-DD)
     - `to_date` (optional string): End date in ISO format (YYYY-MM-DD)
   - Returns: Array of transcript objects with basic information

2. `fireflies_get_transcript_details`
   - Get detailed information about a specific transcript
   - Inputs:
     - `transcript_id` (string): ID of the transcript to retrieve
   - Returns: Comprehensive transcript details including speakers, content, and metadata

3. `fireflies_search_transcripts`
   - Search for transcripts containing specific keywords
   - Inputs:
     - `query` (string): Search query to find relevant transcripts
     - `limit` (optional number): Maximum number of transcripts to return
   - Returns: Array of matching transcript objects

4. `fireflies_generate_summary`
   - Generate a summary of a meeting transcript
   - Inputs:
     - `transcript_id` (string): ID of the transcript to summarize
     - `format` (optional string): Format of the summary ('bullet_points' or 'paragraph')
   - Returns: Generated summary text

## Setup

### Fireflies API Key

[Create a Fireflies API Key](https://fireflies.ai/dashboard/settings/api):
   - Go to the Fireflies.ai dashboard
   - Navigate to Settings > API
   - Generate a new API key
   - Copy the generated key

## Installation

All installation methods require [Bun](https://bun.sh).

### Option 1: Install globally from GitHub

```bash
bun install -g github:evans-sam/fireflies-mcp
```

This installs the `fireflies-mcp` binary. Then configure your MCP client:

```json
{
  "mcpServers": {
    "fireflies": {
      "command": "fireflies-mcp",
      "env": {
        "FIREFLIES_API_KEY": "<YOUR_API_KEY>"
      }
    }
  }
}
```

> **Note:** The binary is installed to `~/.bun/bin/`. Make sure this is on your `PATH` (add `export PATH="$HOME/.bun/bin:$PATH"` to your shell profile if needed).

### Option 2: Run directly with bunx

No install needed — `bunx` downloads and runs on the fly:

```json
{
  "mcpServers": {
    "fireflies": {
      "command": "bunx",
      "args": ["github:evans-sam/fireflies-mcp"],
      "env": {
        "FIREFLIES_API_KEY": "<YOUR_API_KEY>"
      }
    }
  }
}
```

### Option 3: Clone and run locally

```bash
git clone https://github.com/evans-sam/fireflies-mcp.git
cd fireflies-mcp
bun install
```

Then point your MCP client to the source directly:

```json
{
  "mcpServers": {
    "fireflies": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/fireflies-mcp/src/index.ts"],
      "env": {
        "FIREFLIES_API_KEY": "<YOUR_API_KEY>"
      }
    }
  }
}
```

### Option 4: Docker (HTTP transport)

Run as a persistent HTTP server in Docker:

```bash
# Using docker-compose (recommended)
FIREFLIES_API_KEY=your_api_key docker compose up -d

# Or directly
docker build -t fireflies-mcp .
docker run -d \
  --name fireflies-mcp \
  -p 127.0.0.1:3000:3000 \
  -e FIREFLIES_API_KEY=your_api_key \
  --restart unless-stopped \
  fireflies-mcp
```

Verify it's running:

```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

Then configure your MCP client to connect over HTTP:

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

```bash
# Managing the container
docker compose logs -f fireflies-mcp   # View logs
docker compose down                     # Stop
docker compose up -d --build            # Rebuild after changes
```

### Future: npm publish

To make this installable via `npx` for Node.js users (without requiring Bun), the package would need a build step to transpile TypeScript to JavaScript before publishing. The steps would be:

1. Add a build script: `bun build src/index.ts --outdir dist --target node`
2. Change `bin` in package.json to point to `dist/index.js`
3. Update `files` to include `dist` instead of `src`
4. Publish to npm: `npm publish`
5. Users install with: `npx fireflies-mcp`

This is not yet implemented since all current consumers use Bun.

## MCP Client Configuration

The examples above show the JSON snippets to add. Here's where each client stores its config:

| Client | Config file |
|---|---|
| Claude Code | `~/.claude.json` → top-level `mcpServers` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |

> **Important:** The `command`, `args`, and `env` keys go directly under the server name. Do **not** nest an extra `mcpServers` object inside.

## Development

```bash
# Start the server (stdio mode)
FIREFLIES_API_KEY=your_api_key bun run start

# Start in HTTP mode
FIREFLIES_API_KEY=your_api_key TRANSPORT=http bun run start

# Run tests
bun test

# Lint and format
bun run lint
bun run format

# Type check
bun run typecheck
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FIREFLIES_API_KEY` | Yes | — | Your Fireflies.ai API key |
| `TRANSPORT` | No | `stdio` | Transport mode: `stdio` or `http` |
| `PORT` | No | `3000` | HTTP server port (only used when `TRANSPORT=http`) |

## License

This MCP server is licensed under the MIT License. See the original [Props-Labs/fireflies-mcp](https://github.com/Props-Labs/fireflies-mcp) repository.
