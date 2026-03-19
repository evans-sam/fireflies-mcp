# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MCP server and CLI for the Fireflies.ai API. Single dispatcher entry point (`src/main.ts`) routes between MCP server mode and CLI commands. Supports both Bun and Node.js 18+. Published to npm as `fireflies-mcp`.

## Commands

```bash
bun install              # Install dependencies
bun run start            # Start MCP server (stdio mode, requires FIREFLIES_API_KEY)
bun test                 # Run tests (Bun's built-in test runner)
bun run lint             # Lint with Biome
bun run format           # Format with Biome (auto-fix)
bun run build            # Build dist/main.js for Node.js (bun build --target node)
```

## Architecture

Three source modules in `src/`:

- **`client.ts`** — `FirefliesApiClient` wrapping the Fireflies GraphQL API. Uses `fetch` with `AbortSignal.timeout(60s)`. Shared by both MCP server and CLI.
- **`server.ts`** — `FirefliesServer` (MCP protocol handler), `startHttpServer()` (HTTP transport), and tool definitions. HTTP server detects runtime: `Bun.serve()` on Bun, `node:http` on Node.
- **`main.ts`** — Launcher/dispatcher. Parses `process.argv` to route between `serve` (MCP server) and CLI subcommands (`transcripts`, `details`, `search`, `summary`).
- **`cli.ts`** — CLI command handlers. Each command uses `FirefliesApiClient` directly, with `--json` flag for machine-readable output.

### Subcommand structure

```
fireflies-mcp                              → MCP stdio server (default)
fireflies-mcp serve [--http] [--port N]    → MCP server (explicit)
fireflies-mcp transcripts [options]         → CLI
fireflies-mcp details <id> [options]        → CLI
fireflies-mcp search <query> [options]      → CLI
fireflies-mcp summary <id> [options]        → CLI
```

## Key Details

- **Dual runtime** — Bun runs TypeScript directly; Node.js uses the compiled `dist/main.js`.
- **ESM project** — `"type": "module"` in package.json.
- **All MCP logging goes to stderr** (`process.stderr.write`) to avoid breaking stdio protocol.
- `FIREFLIES_API_KEY` env var is required for all commands.
- **Biome** handles linting, formatting, and import sorting. Config in `biome.json`.
- `import.meta.main` (Bun) / `import.meta.url` (Node) guard prevents server startup on import.
- Search uses the Fireflies `title` parameter on the `transcripts` GraphQL query.
- Docker image uses `oven/bun:1` base, runs `serve --http` on port 3000.
- **npm publishing**: `bun run build` compiles to `dist/main.js` targeting Node. `npm publish` on `v*` tags via GitHub Actions.
