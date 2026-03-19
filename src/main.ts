#!/usr/bin/env node

import { parseArgs } from "node:util";
import { runCli } from "./cli.ts";
import { FirefliesServer, startHttpServer } from "./server.ts";

const VERSION = "0.1.0";

const HELP = `fireflies-mcp — Fireflies.ai MCP server and CLI

Usage:
  fireflies-mcp                                      Start MCP server (stdio)
  fireflies-mcp serve [--http] [--port <port>]       Start MCP server
  fireflies-mcp transcripts [options]                 List transcripts
  fireflies-mcp details <transcript-id> [options]     Get transcript details
  fireflies-mcp search <query> [options]              Search transcripts
  fireflies-mcp summary <transcript-id> [options]     Generate summary

Global options:
  --help, -h       Show this help
  --version, -v    Show version

CLI options:
  --json           Output raw JSON instead of formatted text
  --limit <n>      Maximum number of results (default: 20)
  --from <date>    Start date filter (YYYY-MM-DD)
  --to <date>      End date filter (YYYY-MM-DD)
  --format <fmt>   Summary format: bullet_points or paragraph

Environment:
  FIREFLIES_API_KEY   Required. Your Fireflies.ai API key.
`;

function requireApiKey(): string {
	const apiKey = process.env.FIREFLIES_API_KEY;
	if (!apiKey) {
		process.stderr.write(
			"Error: FIREFLIES_API_KEY environment variable is required\n",
		);
		process.exit(1);
	}
	return apiKey;
}

async function runServe(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			http: { type: "boolean", default: false },
			port: { type: "string", default: "3000" },
		},
		strict: false,
	});

	const apiKey = requireApiKey();

	if (values.http) {
		const port = Number.parseInt(values.port as string, 10);
		await startHttpServer(apiKey, port);
	} else {
		const server = new FirefliesServer(apiKey);
		await server.start();
	}
}

// Entry point
const isMain =
	typeof Bun !== "undefined"
		? import.meta.main
		: import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
	const args = process.argv.slice(2);
	const command = args[0];

	if (command === "--help" || command === "-h") {
		process.stdout.write(HELP);
		process.exit(0);
	}

	if (command === "--version" || command === "-v") {
		process.stdout.write(`${VERSION}\n`);
		process.exit(0);
	}

	const CLI_COMMANDS = ["transcripts", "details", "search", "summary"];

	if (!command || command === "serve") {
		// Server mode (default)
		runServe(args.slice(command === "serve" ? 1 : 0)).catch((error) => {
			process.stderr.write(
				`Fatal server error: ${error instanceof Error ? error.message : String(error)}\n`,
			);
			process.exit(1);
		});
	} else if (CLI_COMMANDS.includes(command)) {
		const apiKey = requireApiKey();
		runCli(command, args.slice(1), apiKey).catch((error) => {
			process.stderr.write(
				`Error: ${error instanceof Error ? error.message : String(error)}\n`,
			);
			process.exit(1);
		});
	} else {
		process.stderr.write(`Unknown command: ${command}\n\n`);
		process.stdout.write(HELP);
		process.exit(1);
	}
}
