import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { FirefliesApiClient, startHttpServer } from "./index.ts";

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
