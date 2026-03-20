import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { FirefliesApiClient } from "./client.ts";
import { startHttpServer } from "./server.ts";

const originalStderrWrite = process.stderr.write;
const originalFetch = globalThis.fetch;

describe("FirefliesApiClient", () => {
	beforeEach(() => {
		process.stderr.write = () => true;
	});
	afterEach(() => {
		process.stderr.write = originalStderrWrite;
		globalThis.fetch = originalFetch;
		mock.restore();
	});

	describe("getTranscripts", () => {
		test("returns transcripts from a successful GraphQL response", async () => {
			const mockTranscripts = [
				{ id: "1", title: "Meeting 1", date: "2024-01-01" },
				{ id: "2", title: "Meeting 2", date: "2024-01-02" },
			];

			globalThis.fetch = mock(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							data: { transcripts: mockTranscripts },
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					),
				),
			);

			const client = new FirefliesApiClient("test-api-key");
			const result = await client.getTranscripts(10);

			expect(result).toEqual(mockTranscripts);
			expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		});

		test("sends correct authorization header", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(
					new Response(JSON.stringify({ data: { transcripts: [] } }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				),
			);

			const client = new FirefliesApiClient("my-secret-key");
			await client.getTranscripts();

			const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
			const options = call[1] as RequestInit;
			const headers = options.headers as Record<string, string>;
			expect(headers.Authorization).toBe("Bearer my-secret-key");
		});

		test("passes date filters as GraphQL variables", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(
					new Response(JSON.stringify({ data: { transcripts: [] } }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				),
			);

			const client = new FirefliesApiClient("test-key");
			await client.getTranscripts(5, "2024-01-01", "2024-06-01");

			const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
			const body = JSON.parse(call[1].body as string);
			expect(body.variables.fromDate).toBe("2024-01-01");
			expect(body.variables.toDate).toBe("2024-06-01");
			expect(body.variables.limit).toBe(5);
		});

		test("retries with minimal fields on timeout", async () => {
			let callCount = 0;
			globalThis.fetch = mock(() => {
				callCount++;
				if (callCount === 1) {
					const error = new DOMException(
						"The operation was aborted",
						"AbortError",
					);
					return Promise.reject(error);
				}
				return Promise.resolve(
					new Response(
						JSON.stringify({
							data: {
								transcripts: [
									{ id: "1", title: "Meeting", date: "2024-01-01" },
								],
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					),
				);
			});

			const client = new FirefliesApiClient("test-key");
			const result = await client.getTranscripts(10);

			expect(callCount).toBe(2);
			expect(result).toHaveLength(1);
		});
	});

	describe("error handling", () => {
		test("throws on 401 unauthorized", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(new Response("Unauthorized", { status: 401 })),
			);

			const client = new FirefliesApiClient("bad-key");
			expect(client.getTranscripts()).rejects.toThrow("unauthorized");
		});

		test("throws on GraphQL errors", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							errors: [{ message: "Something went wrong" }],
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					),
				),
			);

			const client = new FirefliesApiClient("test-key");
			expect(client.getTranscripts()).rejects.toThrow("Something went wrong");
		});
	});
});

describe("HTTP transport", () => {
	let server: Awaited<ReturnType<typeof startHttpServer>>;

	beforeEach(async () => {
		process.stderr.write = () => true;
		server = await startHttpServer("test-api-key", 0);
	});

	afterEach(async () => {
		process.stderr.write = originalStderrWrite;
		await server.close();
	});

	test("GET /health returns 200", async () => {
		const res = await fetch(`http://localhost:${server.port}/health`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
	});

	test("POST /mcp with initialize returns server info", async () => {
		const res = await fetch(`http://localhost:${server.port}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: { name: "test-client", version: "1.0.0" },
				},
			}),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.result.serverInfo.name).toBe("fireflies-mcp-server");
	});
});

describe("MCP tool call responses", () => {
	let server: Awaited<ReturnType<typeof startHttpServer>>;

	beforeEach(async () => {
		process.stderr.write = () => true;
	});

	afterEach(async () => {
		process.stderr.write = originalStderrWrite;
		globalThis.fetch = originalFetch;
		mock.restore();
		if (server) await server.close();
	});

	/** Helper: start server, initialize MCP session, call a tool, return result */
	async function callMcpTool(
		toolName: string,
		args: Record<string, any>,
		graphqlResponse: any,
	) {
		// Intercept fetch to mock GraphQL while allowing local HTTP
		const realFetch = globalThis.fetch;
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("api.fireflies.ai")) {
				return new Response(JSON.stringify(graphqlResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return realFetch(input, init);
		}) as typeof fetch;

		server = await startHttpServer("test-api-key", 0);
		const base = `http://localhost:${server.port}/mcp`;
		const headers = {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		};

		// Initialize
		const initRes = await realFetch(base, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: { name: "test-client", version: "1.0.0" },
				},
			}),
		});
		await initRes.json();
		const sessionId = initRes.headers.get("mcp-session-id");

		// Send initialized notification
		await realFetch(base, {
			method: "POST",
			headers: {
				...headers,
				...(sessionId ? { "mcp-session-id": sessionId } : {}),
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "notifications/initialized",
			}),
		});

		// Call tool
		const toolRes = await realFetch(base, {
			method: "POST",
			headers: {
				...headers,
				...(sessionId ? { "mcp-session-id": sessionId } : {}),
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: { name: toolName, arguments: args },
			}),
		});

		return toolRes.json();
	}

	test("get_transcripts returns content array with text, not nested toolResult", async () => {
		const body = await callMcpTool(
			"fireflies_get_transcripts",
			{ limit: 2 },
			{
				data: {
					transcripts: [{ id: "1", title: "Standup", date: "2024-01-01" }],
				},
			},
		);

		const result = body.result;
		expect(result).toBeDefined();
		expect(result.toolResult).toBeUndefined();
		expect(result.content).toBeArray();
		expect(result.content[0].type).toBe("text");
		expect(result.content[0].text).not.toBe("[object Object]");
		expect(result.content[0].text).toContain("Standup");
	});

	test("get_transcript_details returns content with transcript text", async () => {
		const body = await callMcpTool(
			"fireflies_get_transcript_details",
			{ transcript_id: "abc-123" },
			{
				data: {
					transcript: {
						id: "abc-123",
						title: "Planning",
						dateString: "2024-01-15",
						duration: 1800,
						participants: ["Alice", "Bob"],
						sentences: [{ speaker_name: "Alice", text: "Let's plan" }],
						summary: {
							overview: "Sprint planning session",
							keywords: ["sprint", "velocity"],
							action_items: ["Review backlog"],
						},
					},
				},
			},
		);

		const result = body.result;
		expect(result).toBeDefined();
		expect(result.toolResult).toBeUndefined();
		expect(result.content).toBeArray();
		expect(result.content[0].type).toBe("text");
		const text = result.content[0].text;
		expect(text).not.toBe("[object Object]");
		expect(text).toContain("Planning");
		expect(text).toContain("Alice: Let's plan");
		expect(text).toContain("Sprint planning session");
	});

	test("search_transcripts returns content with search results", async () => {
		const body = await callMcpTool(
			"fireflies_search_transcripts",
			{ query: "planning" },
			{
				data: {
					transcripts: [
						{
							id: "1",
							title: "Sprint Planning",
							dateString: "2024-01-15",
							duration: 3600,
							summary: { overview: "Planned the sprint" },
						},
					],
				},
			},
		);

		const result = body.result;
		expect(result).toBeDefined();
		expect(result.toolResult).toBeUndefined();
		expect(result.content).toBeArray();
		expect(result.content[0].type).toBe("text");
		const text = result.content[0].text;
		expect(text).not.toBe("[object Object]");
		expect(text).toContain("Sprint Planning");
	});

	test("generate_summary returns content with summary text", async () => {
		const body = await callMcpTool(
			"fireflies_generate_summary",
			{ transcript_id: "abc-123" },
			{
				data: {
					transcript: {
						id: "abc-123",
						title: "Meeting",
						summary: {
							overview: "Discussed roadmap",
							keywords: ["roadmap"],
							action_items: ["Create tickets"],
						},
					},
				},
			},
		);

		const result = body.result;
		expect(result).toBeDefined();
		expect(result.toolResult).toBeUndefined();
		expect(result.content).toBeArray();
		expect(result.content[0].type).toBe("text");
		const text = result.content[0].text;
		expect(text).not.toBe("[object Object]");
		expect(text).toContain("Discussed roadmap");
	});
});
