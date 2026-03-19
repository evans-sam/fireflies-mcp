# Plan: Publish to npm with Dual Runtime Support

> Source: conversation with user, 2026-03-19

## Context

We want to publish `fireflies-mcp` to npm as an unscoped package so anyone can install it with `npx fireflies-mcp`. The package should work as both an MCP server (stdio and HTTP) and a standalone CLI tool, dispatched via a single launcher entry point. It must run on both Bun and Node.js 18+ — the API client, CLI commands, and stdio MCP server use only standard Web APIs, and the HTTP server needs a small runtime detection branch for `Bun.serve()` vs `node:http`.

We follow strict semver. Current version is `0.1.0` (pre-stable, initial development).

## Architectural decisions

- **Single dispatcher pattern**: One `bin` entry (`fireflies-mcp`) that checks `process.argv[2]` to route between server mode and CLI commands. No args defaults to MCP stdio server (backward-compatible with MCP client configs).
- **Package name**: `fireflies-mcp` (unscoped, available on npm)
- **Versioning**: `0.x.y` semver. Stays pre-1.0 until the public API stabilizes.
- **Build target**: `bun build src/main.ts --outdir dist --target node` produces a single JS file that runs on Node 18+. Bun users can run the TypeScript source directly.
- **Bin entry**: Points to `dist/main.js` (the compiled launcher). This ensures `npx fireflies-mcp` works on Node without Bun installed.
- **Conditional exports**: `"bun"` condition points to TypeScript source, `"default"` points to compiled JS.
- **Runtime detection**: `typeof Bun !== "undefined"` in the HTTP server path. Stdio transport and CLI commands are runtime-agnostic.
- **Module structure**:
  - `src/client.ts` — `FirefliesApiClient` (shared by MCP server and CLI)
  - `src/server.ts` — MCP server (`FirefliesServer`, `startHttpServer`, tool definitions)
  - `src/cli.ts` — CLI command handlers
  - `src/main.ts` — Launcher/dispatcher (the bin entry point)
- **CI/CD**: GitHub Actions workflow triggered on version tags (`v*`). Runs tests, builds, publishes to npm.
- **npm auth**: Requires `NPM_TOKEN` secret in the GitHub repo settings.

### Subcommand structure

```
fireflies-mcp                              → MCP stdio server (default, no args)
fireflies-mcp serve                        → MCP stdio server (explicit)
fireflies-mcp serve --http [--port 3000]   → MCP HTTP server
fireflies-mcp transcripts [--limit N] [--from DATE] [--to DATE] [--json]
fireflies-mcp details <transcript-id> [--json]
fireflies-mcp search <query> [--limit N] [--from DATE] [--to DATE] [--json]
fireflies-mcp summary <transcript-id> [--format bullet_points|paragraph] [--json]
```

All CLI commands read `FIREFLIES_API_KEY` from the environment. The `--json` flag outputs raw JSON instead of human-readable text.

---

## Phase 1: Extract shared client module

### What to build

Move `FirefliesApiClient` from `src/index.ts` into `src/client.ts`. Move tool definitions and `FirefliesServer` class into `src/server.ts`. Create `src/main.ts` as the new entry point that imports from both. Update existing tests to import from the new paths. Verify all 8 existing tests still pass.

This is pure refactoring — no new behavior.

### Acceptance criteria

- [ ] `src/client.ts` exports `FirefliesApiClient`
- [ ] `src/server.ts` exports `FirefliesServer`, `startHttpServer`, and tool definitions
- [ ] `src/main.ts` is the entry point with `import.meta.main` guard, dispatching to server
- [ ] All 8 existing tests pass
- [ ] `FIREFLIES_API_KEY=test bun run src/main.ts` starts the MCP stdio server
- [ ] `FIREFLIES_API_KEY=test TRANSPORT=http bun run src/main.ts` starts the HTTP server
- [ ] Biome lint passes

---

## Phase 2: Build the launcher dispatcher

### What to build

Replace the `import.meta.main` block in `src/main.ts` with a dispatcher that parses `process.argv` using `util.parseArgs`. When no subcommand is given (or `serve` is given), start the MCP server. When a CLI subcommand is recognized (`transcripts`, `details`, `search`, `summary`), delegate to CLI handlers (stubbed as "not yet implemented" in this phase). Add `--help` and `--version` flags.

Make the entry point guard runtime-agnostic: use `import.meta.main` on Bun, fall back to `import.meta.url` comparison on Node.

### Acceptance criteria

- [ ] `fireflies-mcp` (no args) starts MCP stdio server
- [ ] `fireflies-mcp serve` starts MCP stdio server
- [ ] `fireflies-mcp serve --http` starts HTTP server
- [ ] `fireflies-mcp serve --http --port 4000` starts HTTP server on port 4000
- [ ] `fireflies-mcp transcripts` prints "not yet implemented" (stub)
- [ ] `fireflies-mcp --help` prints usage info
- [ ] `fireflies-mcp --version` prints version from package.json
- [ ] Entry point works on both Bun and Node

---

## Phase 3: Implement CLI commands (TDD)

### What to build

Create `src/cli.ts` with handlers for each CLI subcommand. Each handler instantiates `FirefliesApiClient` and calls the corresponding method. Default output is human-readable text; `--json` outputs the raw API response as JSON. Use `util.parseArgs` for argument parsing.

Write tests first for each command using mocked `fetch`, then implement.

### Acceptance criteria

- [ ] `fireflies-mcp transcripts` lists transcripts in human-readable format
- [ ] `fireflies-mcp transcripts --json` outputs JSON array
- [ ] `fireflies-mcp transcripts --limit 5 --from 2024-01-01 --to 2024-06-01` applies filters
- [ ] `fireflies-mcp details <id>` shows formatted transcript with speakers and summary
- [ ] `fireflies-mcp details <id> --json` outputs raw JSON
- [ ] `fireflies-mcp search "keyword"` shows matching transcripts
- [ ] `fireflies-mcp search "keyword" --json` outputs JSON
- [ ] `fireflies-mcp summary <id>` shows bullet-point summary
- [ ] `fireflies-mcp summary <id> --format paragraph` shows paragraph summary
- [ ] Missing required args print usage help and exit with code 1
- [ ] Missing `FIREFLIES_API_KEY` prints clear error and exits with code 1
- [ ] All CLI tests pass

---

## Phase 4: Make HTTP server dual-runtime

### What to build

In `startHttpServer()`, detect the runtime and branch: use `Bun.serve()` when running on Bun, fall back to `node:http.createServer()` on Node. The `WebStandardStreamableHTTPServerTransport` already works on both runtimes. The Node path needs to convert `IncomingMessage`/`ServerResponse` to Web Standard `Request`/`Response` — use the SDK's `StreamableHTTPServerTransport` (Node wrapper) or manual conversion.

### Acceptance criteria

- [ ] `TRANSPORT=http bun run src/main.ts` starts HTTP server using `Bun.serve()`
- [ ] `TRANSPORT=http node dist/main.js` starts HTTP server using `node:http`
- [ ] Health check (`GET /health`) works on both runtimes
- [ ] MCP initialize request (`POST /mcp`) works on both runtimes
- [ ] Existing HTTP transport tests pass on Bun

---

## Phase 5: Add build step and package.json for npm

### What to build

Add a `build` script that uses `bun build` to compile `src/main.ts` into `dist/main.js` targeting Node. Update `package.json`:
- `bin` points to `dist/main.js`
- `files` includes both `src` and `dist`
- `exports` uses conditional `"bun"` / `"default"` paths
- Add `prepublishOnly` script that runs lint, typecheck, test, and build
- Add `engines` field: `"node": ">=18.0.0"`

Verify `npx` works by doing a dry run: `npm pack`, extract, run the bin entry with Node.

### Acceptance criteria

- [ ] `bun run build` produces `dist/main.js`
- [ ] `node dist/main.js` starts MCP stdio server
- [ ] `node dist/main.js transcripts --help` shows CLI help
- [ ] `node dist/main.js serve --http` starts HTTP server on Node
- [ ] `npm pack` produces a valid tarball
- [ ] Extracting and running the bin entry from the tarball works on Node 18+
- [ ] `package.json` has correct `bin`, `files`, `exports`, `engines`

---

## Phase 6: Add GitHub Actions CI/CD

### What to build

Create `.github/workflows/ci.yml` for PR checks (lint, typecheck, test on Bun) and `.github/workflows/publish.yml` for npm publishing on version tags. The publish workflow:
1. Triggers on `v*` tag push
2. Runs full test suite
3. Builds the dist
4. Publishes to npm using `NPM_TOKEN` secret
5. Creates a GitHub release

### Acceptance criteria

- [ ] Push to any branch runs lint, typecheck, and tests
- [ ] Pushing a `v0.2.0` tag triggers the publish workflow
- [ ] Publish workflow runs tests before publishing
- [ ] Published package is installable: `npx fireflies-mcp --version`
- [ ] GitHub release is created with the tag name
- [ ] Workflow fails cleanly if `NPM_TOKEN` is not set

---

## Phase 7: Update documentation

### What to build

Update README, CLAUDE.md, and mcp.json to reflect the new unified package. Document all installation methods (npx, global install, Docker), all CLI commands, and the MCP server configuration. Remove references to the old `bun run src/index.ts` pattern in MCP client configs — the new config is just `"command": "npx", "args": ["fireflies-mcp"]`.

### Acceptance criteria

- [ ] README documents all subcommands with examples
- [ ] README documents `npx fireflies-mcp` as the primary install method
- [ ] README documents Docker as an alternative
- [ ] README documents `--json` flag for all CLI commands
- [ ] CLAUDE.md reflects new module structure and commands
- [ ] mcp.json updated for the published package
