import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { runCli } from "./cli.ts";

const originalStderrWrite = process.stderr.write;
const originalFetch = globalThis.fetch;

function mockFetchResponse(data: any) {
	globalThis.fetch = mock(() =>
		Promise.resolve(
			new Response(JSON.stringify({ data }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		),
	);
}

describe("CLI", () => {
	let output: string;
	const originalStdoutWrite = process.stdout.write;

	beforeEach(() => {
		output = "";
		process.stderr.write = () => true;
		process.stdout.write = ((chunk: any) => {
			output += typeof chunk === "string" ? chunk : chunk.toString();
			return true;
		}) as any;
	});

	afterEach(() => {
		process.stderr.write = originalStderrWrite;
		process.stdout.write = originalStdoutWrite;
		globalThis.fetch = originalFetch;
		mock.restore();
	});

	describe("transcripts", () => {
		test("--json outputs JSON array", async () => {
			mockFetchResponse({
				transcripts: [
					{ id: "1", title: "Standup", date: "2024-01-01" },
					{ id: "2", title: "Retro", date: "2024-01-02" },
				],
			});

			await runCli("transcripts", ["--json"], "test-key");

			const parsed = JSON.parse(output);
			expect(parsed).toHaveLength(2);
			expect(parsed[0].title).toBe("Standup");
		});

		test("default output is human-readable", async () => {
			mockFetchResponse({
				transcripts: [
					{
						id: "1",
						title: "Standup",
						dateString: "Jan 1, 2024",
						duration: 1800,
						summary: { overview: "Daily sync" },
					},
				],
			});

			await runCli("transcripts", [], "test-key");

			expect(output).toContain("Standup");
			expect(output).toContain("Jan 1, 2024");
			expect(output).not.toContain('"id"');
		});

		test("passes --limit, --from, --to as GraphQL variables", async () => {
			mockFetchResponse({ transcripts: [] });

			await runCli(
				"transcripts",
				["--limit", "5", "--from", "2024-01-01", "--to", "2024-06-01"],
				"test-key",
			);

			const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
			const body = JSON.parse(call[1].body as string);
			expect(body.variables.limit).toBe(5);
			expect(body.variables.fromDate).toBe("2024-01-01");
			expect(body.variables.toDate).toBe("2024-06-01");
		});
	});

	describe("search", () => {
		test("--json outputs JSON array", async () => {
			mockFetchResponse({
				transcripts: [{ id: "1", title: "Sprint Planning" }],
			});

			await runCli("search", ["sprint", "--json"], "test-key");

			const parsed = JSON.parse(output);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].title).toBe("Sprint Planning");
		});
	});

	describe("details", () => {
		test("--json outputs JSON object", async () => {
			mockFetchResponse({
				transcript: {
					id: "abc",
					title: "Meeting",
					sentences: [{ speaker_name: "Alice", text: "Hello" }],
				},
			});

			await runCli("details", ["abc", "--json"], "test-key");

			const parsed = JSON.parse(output);
			expect(parsed.id).toBe("abc");
			expect(parsed.title).toBe("Meeting");
		});
	});

	describe("summary", () => {
		test("--json outputs JSON object", async () => {
			mockFetchResponse({
				transcript: {
					id: "abc",
					title: "Meeting",
					summary: {
						overview: "A good meeting",
						keywords: ["sync", "update"],
						action_items: ["Follow up"],
						topics_discussed: ["Planning"],
					},
				},
			});

			await runCli("summary", ["abc", "--json"], "test-key");

			const parsed = JSON.parse(output);
			expect(parsed.overview).toBe("A good meeting");
		});

		test("default output shows formatted summary", async () => {
			mockFetchResponse({
				transcript: {
					id: "abc",
					title: "Meeting",
					summary: {
						overview: "A good meeting",
						keywords: ["sync"],
						action_items: ["Follow up"],
						topics_discussed: ["Planning"],
					},
				},
			});

			await runCli("summary", ["abc"], "test-key");

			expect(output).toContain("A good meeting");
			expect(output).toContain("Follow up");
		});
	});

	describe("regression: no [object Object] in output", () => {
		test("transcripts with nested objects render cleanly", async () => {
			mockFetchResponse({
				transcripts: [
					{
						id: "1",
						title: "Meeting",
						dateString: "Jan 1",
						duration: 3600,
						speakers: [{ id: 0, name: "Alice" }],
						summary: {
							keywords: ["planning", "review"],
							overview: "Weekly sync",
						},
					},
				],
			});

			await runCli("transcripts", [], "test-key");

			expect(output).not.toContain("[object Object]");
			expect(output).toContain("Weekly sync");
		});

		test("details with complex summary render cleanly", async () => {
			mockFetchResponse({
				transcript: {
					id: "abc",
					title: "Complex Meeting",
					dateString: "Jan 1",
					duration: 1800,
					participants: ["Alice", "Bob"],
					sentences: [{ speaker_name: "Alice", text: "Hello" }],
					formatted_text: "Alice: Hello",
					summary: {
						overview: "A good meeting",
						keywords: ["sync", "update"],
						action_items: ["Follow up on X", "Review Y"],
						topics_discussed: ["Planning", "Roadmap"],
					},
				},
			});

			await runCli("details", ["abc"], "test-key");

			expect(output).not.toContain("[object Object]");
			expect(output).toContain("Complex Meeting");
			expect(output).toContain("Alice: Hello");
		});

		test("summary with array fields never produces [object Object]", async () => {
			mockFetchResponse({
				transcript: {
					id: "abc",
					title: "Meeting",
					summary: {
						overview: "Overview text",
						keywords: ["k1", "k2"],
						action_items: ["action 1", "action 2"],
						topics_discussed: ["topic 1", "topic 2"],
					},
				},
			});

			await runCli("summary", ["abc"], "test-key");

			expect(output).not.toContain("[object Object]");
			expect(output).toContain("Overview text");
			expect(output).toContain("action 1");
			expect(output).toContain("topic 1");
		});
	});
});
