# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MCP (Model Context Protocol) server for the Fireflies.ai API. Exposes four tools for transcript retrieval, search, and summary generation. Supports both stdio and HTTP (StreamableHTTP) transport modes. Runs on Bun.

## Commands

```bash
bun install              # Install dependencies
bun run start            # Start server (stdio mode, requires FIREFLIES_API_KEY)
bun test                 # Run tests
bun run lint             # Lint with Biome
bun run format           # Format with Biome (auto-fix)
bun run typecheck        # TypeScript type checking (no emit)
```

To start in HTTP mode: `TRANSPORT=http PORT=3000 FIREFLIES_API_KEY=... bun run start`

## Architecture

Single-file server in `src/index.ts` with two main classes:

- **`FirefliesApiClient`** — wraps the Fireflies GraphQL API (`https://api.fireflies.ai/graphql`). Uses `fetch` with `AbortSignal.timeout(60s)`. Has a timeout-retry fallback that re-requests with minimal fields.
- **`FirefliesServer`** — creates an MCP `Server` instance, registers `ListTools` and `CallTool` handlers. Routes tool calls through `handleToolCall` which dispatches to the API client.

Exported `startHttpServer()` function creates a `Bun.serve()` HTTP server with `WebStandardStreamableHTTPServerTransport` for containerized/persistent deployment.

The four MCP tools map directly to API client methods:
| Tool | Client method |
|---|---|
| `fireflies_get_transcripts` | `getTranscripts()` |
| `fireflies_get_transcript_details` | `getTranscriptDetails()` |
| `fireflies_search_transcripts` | `searchTranscripts()` |
| `fireflies_generate_summary` | `generateTranscriptSummary()` |

## Key Details

- **Bun runtime** — no build step needed; TypeScript runs directly.
- **ESM project** — `"type": "module"` in package.json.
- **All logging goes to stderr** (`process.stderr.write`) to avoid breaking the MCP stdio protocol. Never use `console.log`.
- `FIREFLIES_API_KEY` env var is required at startup; the server exits without it.
- `TRANSPORT` env var selects mode: `stdio` (default) or `http`.
- `PORT` env var sets the HTTP port (default `3000`, only used in `http` mode).
- **Biome** handles linting, formatting, and import sorting. Config in `biome.json`.
- `import.meta.main` guard prevents the server from starting when the module is imported (e.g., in tests).
- Search uses the Fireflies `title` parameter on the `transcripts` GraphQL query (not a dedicated search endpoint).
- Docker image uses `oven/bun:1` base, exposes HTTP transport on port 3000.
