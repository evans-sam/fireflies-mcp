import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	CallToolRequestSchema,
	type CallToolResult,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
	type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { FirefliesApiClient } from "./client.ts";

export const TOOLS: Tool[] = [
	{
		name: "fireflies_get_transcripts",
		description:
			"Retrieve a list of meeting transcripts with optional filtering. By default, returns up to 20 most recent transcripts with no date filtering. Note that this operation may take longer for large datasets and might timeout. If a timeout occurs, a minimal set of transcript data will be returned.",
		inputSchema: {
			type: "object",
			properties: {
				limit: {
					type: "number",
					description:
						"Maximum number of transcripts to return (default: 20). Consider using a smaller limit if experiencing timeouts.",
				},
				from_date: {
					type: "string",
					description:
						"Start date in ISO format (YYYY-MM-DD). If not specified, no lower date bound is applied. Using a narrower date range can help prevent timeouts.",
				},
				to_date: {
					type: "string",
					description:
						"End date in ISO format (YYYY-MM-DD). If not specified, no upper date bound is applied. Using a narrower date range can help prevent timeouts.",
				},
			},
		},
	},
	{
		name: "fireflies_get_transcript_details",
		description:
			"Retrieve detailed information about a specific transcript. Returns a human-readable formatted transcript with speaker names and text, along with metadata and summary information.",
		inputSchema: {
			type: "object",
			properties: {
				transcript_id: {
					type: "string",
					description: "ID of the transcript to retrieve",
				},
			},
			required: ["transcript_id"],
		},
	},
	{
		name: "fireflies_search_transcripts",
		description:
			"Search for transcripts containing specific keywords, with optional date filtering. Returns a human-readable list of matching transcripts with metadata and summary information.",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Search query to find relevant transcripts",
				},
				limit: {
					type: "number",
					description: "Maximum number of transcripts to return (default: 20)",
				},
				from_date: {
					type: "string",
					description:
						"Start date in ISO format (YYYY-MM-DD) to filter transcripts by date. If not specified, no lower date bound is applied.",
				},
				to_date: {
					type: "string",
					description:
						"End date in ISO format (YYYY-MM-DD) to filter transcripts by date. If not specified, no upper date bound is applied.",
				},
			},
			required: ["query"],
		},
	},
	{
		name: "fireflies_generate_summary",
		description: "Generate a summary of a meeting transcript",
		inputSchema: {
			type: "object",
			properties: {
				transcript_id: {
					type: "string",
					description: "ID of the transcript to summarize",
				},
				format: {
					type: "string",
					enum: ["bullet_points", "paragraph"],
					description: "Format of the summary (bullet_points or paragraph)",
				},
			},
			required: ["transcript_id"],
		},
	},
];

export class FirefliesServer {
	private apiClient: FirefliesApiClient;
	private server: Server;

	constructor(apiKey: string) {
		this.apiClient = new FirefliesApiClient(apiKey);
		this.server = new Server(
			{
				name: "fireflies-mcp-server",
				version: "1.0.0",
			},
			{
				capabilities: {
					tools: {},
				},
			},
		);

		this.setupHandlers();
		this.setupErrorHandling();
	}

	private setupErrorHandling(): void {
		this.server.onerror = (error) => {
			process.stderr.write(`[MCP Error] ${error.message}\n`);
		};

		process.on("SIGINT", async () => {
			await this.stop();
			process.exit(0);
		});

		process.on("uncaughtException", (error) => {
			process.stderr.write(`[Uncaught Exception] ${error.message}\n`);
			process.exit(1);
		});

		process.on("unhandledRejection", (reason) => {
			process.stderr.write(`[Unhandled Rejection] ${reason}\n`);
		});
	}

	private setupHandlers(): void {
		this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
			tools: TOOLS,
		}));

		this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
			this.handleToolCall(request.params.name, request.params.arguments ?? {}),
		);
	}

	private async handleToolCall(
		name: string,
		args: any,
	): Promise<CallToolResult> {
		try {
			switch (name) {
				case "fireflies_get_transcripts": {
					const { limit, from_date, to_date } = args;
					process.stderr.write(
						`Handling fireflies_get_transcripts with args: ${JSON.stringify(args)}\n`,
					);

					try {
						const timeoutPromise = new Promise<never>((_, reject) => {
							setTimeout(
								() => reject(new Error("Request timed out after 90 seconds")),
								90000,
							);
						});

						const transcripts = await Promise.race([
							this.apiClient.getTranscripts(limit, from_date, to_date),
							timeoutPromise,
						]);

						process.stderr.write(
							`Successfully retrieved ${transcripts.length} transcripts\n`,
						);

						let resultText = JSON.stringify(transcripts, null, 2);

						if (transcripts.length <= 1) {
							resultText += `\n\nNote: Only ${transcripts.length} transcript(s) were found. This might be due to:
1. Limited data in your Fireflies account
2. Date filters restricting results
3. API permissions or visibility settings

To retrieve more transcripts, you can:
- Specify a wider date range using from_date and to_date parameters
- Increase the limit parameter (default is 20)
- Check your Fireflies account permissions and settings`;
						}

						return {
							content: [{ type: "text", text: resultText }],
						};
					} catch (error) {
						process.stderr.write(
							`Error in fireflies_get_transcripts: ${error instanceof Error ? error.message : String(error)}\n`,
						);

						if (error instanceof Error && error.message.includes("timeout")) {
							process.stderr.write(
								`Trying with minimal fields due to timeout...\n`,
							);
							const minimalTranscripts = await this.apiClient.getTranscripts(
								limit,
								from_date,
								to_date,
								true,
							);

							let resultText = JSON.stringify(minimalTranscripts, null, 2);

							resultText += `\n\nNote: Due to timeout, only minimal transcript data was retrieved.
For more details, try requesting specific transcripts using their IDs.

If you're only seeing a few results, this might be due to:
1. Limited data in your Fireflies account
2. Default date range (no specific dates were provided)
3. API permissions or visibility settings

To retrieve more transcripts, you can:
- Specify a wider date range using from_date and to_date parameters
- Increase the limit parameter (default is 20)
- Check your Fireflies account permissions and settings`;

							return {
								content: [{ type: "text", text: resultText }],
							};
						}

						throw error;
					}
				}

				case "fireflies_get_transcript_details": {
					const { transcript_id } = args;

					if (!transcript_id) {
						throw new McpError(
							ErrorCode.InvalidParams,
							"transcript_id parameter is required",
						);
					}

					process.stderr.write(
						`Getting transcript details for ID: ${transcript_id}\n`,
					);

					try {
						const transcript = await this.apiClient.getTranscriptDetails(
							transcript_id,
							true,
						);

						let resultText = `Title: ${transcript.title}\n`;
						resultText += `Date: ${transcript.dateString}\n`;
						resultText += `Duration: ${Math.floor(transcript.duration / 60)}m ${Math.floor(transcript.duration % 60)}s\n`;

						if (transcript.participants && transcript.participants.length > 0) {
							resultText += `Participants: ${transcript.participants.join(", ")}\n`;
						}

						resultText += `\n--- Transcript ---\n\n`;

						if (transcript.formatted_text) {
							resultText += transcript.formatted_text;
						} else {
							resultText += transcript.sentences
								.map(
									(sentence: any) =>
										`${sentence.speaker_name}: ${sentence.text}`,
								)
								.join("\n");
						}

						if (transcript.summary) {
							resultText += `\n\n--- Summary ---\n\n`;

							if (transcript.summary.overview) {
								resultText += `Overview: ${transcript.summary.overview}\n\n`;
							}

							if (
								transcript.summary.action_items &&
								Array.isArray(transcript.summary.action_items) &&
								transcript.summary.action_items.length > 0
							) {
								resultText += `Action Items:\n`;
								transcript.summary.action_items.forEach((item: string) => {
									resultText += `- ${item}\n`;
								});
								resultText += "\n";
							}

							if (
								transcript.summary.keywords &&
								Array.isArray(transcript.summary.keywords) &&
								transcript.summary.keywords.length > 0
							) {
								resultText += `Keywords: ${transcript.summary.keywords.join(", ")}\n`;
							}
						}

						return {
							content: [{ type: "text", text: resultText }],
						};
					} catch (error) {
						process.stderr.write(
							`Error in fireflies_get_transcript_details: ${error instanceof Error ? error.message : String(error)}\n`,
						);

						if (error instanceof McpError) {
							throw error;
						}

						throw new McpError(
							ErrorCode.InternalError,
							`Error retrieving transcript details: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}

				case "fireflies_search_transcripts": {
					const { query, limit, from_date, to_date } = args;

					if (!query) {
						throw new McpError(
							ErrorCode.InvalidParams,
							"query parameter is required",
						);
					}

					process.stderr.write(
						`Searching transcripts with query: "${query}", limit: ${limit || "default"}, from_date: ${from_date || "not specified"}, to_date: ${to_date || "not specified"}\n`,
					);

					try {
						const transcripts = await this.apiClient.searchTranscripts(
							query,
							limit,
							from_date,
							to_date,
						);

						let resultText = `Found ${transcripts.length} matching transcripts for query: "${query}"\n\n`;

						if (transcripts.length === 0) {
							resultText += `No transcripts found matching your search criteria. Try:\n`;
							resultText += `- Using different search terms\n`;
							resultText += `- Widening your date range\n`;
							resultText += `- Increasing the limit parameter\n`;
						} else {
							transcripts.forEach((transcript: any, index: number) => {
								resultText += `${index + 1}. ${transcript.title}\n`;
								resultText += `   ID: ${transcript.id}\n`;
								resultText += `   Date: ${transcript.dateString}\n`;
								resultText += `   Duration: ${Math.floor(transcript.duration / 60)}m ${Math.floor(transcript.duration % 60)}s\n`;

								if (transcript.summary?.overview) {
									resultText += `   Overview: ${transcript.summary.overview}\n`;
								}

								if (
									transcript.summary?.keywords &&
									Array.isArray(transcript.summary.keywords) &&
									transcript.summary.keywords.length > 0
								) {
									resultText += `   Keywords: ${transcript.summary.keywords.join(", ")}\n`;
								}

								resultText += `\n`;
							});

							resultText += `To view the full transcript, use the fireflies_get_transcript_details tool with the transcript ID.`;
						}

						return {
							content: [{ type: "text", text: resultText }],
						};
					} catch (error) {
						process.stderr.write(
							`Error in fireflies_search_transcripts: ${error instanceof Error ? error.message : String(error)}\n`,
						);

						if (error instanceof McpError) {
							throw error;
						}

						throw new McpError(
							ErrorCode.InternalError,
							`Error searching transcripts: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}

				case "fireflies_generate_summary": {
					const { transcript_id, format = "bullet_points" } = args;

					if (!transcript_id) {
						throw new McpError(
							ErrorCode.InvalidParams,
							"transcript_id parameter is required",
						);
					}

					process.stderr.write(
						`Generating summary for transcript ID: ${transcript_id} with format: ${format}\n`,
					);

					try {
						const summary = await this.apiClient.generateTranscriptSummary(
							transcript_id,
							format,
						);

						return {
							content: [{ type: "text", text: summary }],
						};
					} catch (error) {
						process.stderr.write(
							`Error generating summary: ${error instanceof Error ? error.message : String(error)}\n`,
						);

						if (
							error instanceof McpError &&
							error.message.includes("Summary not available")
						) {
							return {
								content: [
									{
										type: "text",
										text: `No summary is available for this transcript (ID: ${transcript_id}). This might be because:
1. The transcript is still being processed
2. The transcript is too short to generate a meaningful summary
3. The summary feature is not enabled for your account

You can try:
- Checking the transcript details to see if it has been fully processed
- Using a different transcript ID
- Contacting Fireflies support if you believe this is an error`,
									},
								],
							};
						}

						throw error;
					}
				}

				default:
					throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
			}
		} catch (error) {
			process.stderr.write(
				`Error in handleToolCall for ${name}: ${error instanceof Error ? error.message : String(error)}\n`,
			);

			if (error instanceof McpError) {
				throw error;
			}

			if (error instanceof Error) {
				throw new McpError(
					ErrorCode.InternalError,
					`Error processing request: ${error.message}`,
				);
			} else {
				throw new McpError(ErrorCode.InternalError, `Unknown error occurred`);
			}
		}
	}

	async start(): Promise<void> {
		const transport = new StdioServerTransport();
		await this.server.connect(transport);
		process.stderr.write("Fireflies MCP server is running\n");
	}

	async stop(): Promise<void> {
		try {
			await this.server.close();
		} catch (error) {
			process.stderr.write(
				`Error while stopping server: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}
	}

	get mcpServer(): Server {
		return this.server;
	}
}

export async function startHttpServer(
	apiKey: string,
	port: number,
): Promise<{ port: number; close: () => Promise<void> }> {
	const handleMcpRequest = async (req: Request): Promise<Response> => {
		const server = new FirefliesServer(apiKey);
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});
		await server.mcpServer.connect(transport);
		return transport.handleRequest(req);
	};

	const handleFetch = async (req: Request): Promise<Response> => {
		const url = new URL(req.url);

		if (url.pathname === "/health") {
			return new Response(JSON.stringify({ status: "ok" }), {
				headers: { "Content-Type": "application/json" },
			});
		}

		if (url.pathname === "/mcp") {
			return handleMcpRequest(req);
		}

		return new Response("Not Found", { status: 404 });
	};

	if (typeof Bun !== "undefined") {
		// Bun runtime
		const httpServer = Bun.serve({ port, fetch: handleFetch });

		process.stderr.write(
			`Fireflies MCP HTTP server running on port ${httpServer.port}\n`,
		);

		return {
			port: httpServer.port,
			close: async () => {
				httpServer.stop(true);
			},
		};
	}

	// Node.js runtime
	const http = await import("node:http");

	const nodeServer = http.createServer(async (req, res) => {
		const url = new URL(req.url || "/", `http://localhost:${port}`);
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(req.headers)) {
			if (typeof value === "string") headers[key] = value;
		}

		const body = await new Promise<Buffer>((resolve) => {
			const chunks: Buffer[] = [];
			req.on("data", (chunk) => chunks.push(chunk));
			req.on("end", () => resolve(Buffer.concat(chunks)));
		});

		const webRequest = new Request(url.toString(), {
			method: req.method,
			headers,
			body: req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
		});

		const webResponse = await handleFetch(webRequest);

		res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
		const responseBody = await webResponse.arrayBuffer();
		res.end(Buffer.from(responseBody));
	});

	return new Promise((resolve) => {
		nodeServer.listen(port, () => {
			const addr = nodeServer.address();
			const actualPort = typeof addr === "object" && addr ? addr.port : port;

			process.stderr.write(
				`Fireflies MCP HTTP server running on port ${actualPort}\n`,
			);

			resolve({
				port: actualPort,
				close: async () => {
					nodeServer.close();
				},
			});
		});
	});
}
