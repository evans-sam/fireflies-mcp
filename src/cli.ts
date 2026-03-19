import { parseArgs } from "node:util";
import { FirefliesApiClient } from "./client.ts";

export async function runCli(
	command: string,
	args: string[],
	apiKey: string,
): Promise<void> {
	const client = new FirefliesApiClient(apiKey);

	switch (command) {
		case "transcripts":
			return handleTranscripts(client, args);
		case "search":
			return handleSearch(client, args);
		case "details":
			return handleDetails(client, args);
		case "summary":
			return handleSummary(client, args);
		default:
			process.stderr.write(`Unknown CLI command: ${command}\n`);
			process.exit(1);
	}
}

async function handleTranscripts(
	client: FirefliesApiClient,
	args: string[],
): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			json: { type: "boolean", default: false },
			limit: { type: "string" },
			from: { type: "string" },
			to: { type: "string" },
		},
		strict: false,
	});

	const limit = values.limit
		? Number.parseInt(values.limit as string, 10)
		: undefined;
	const transcripts = await client.getTranscripts(
		limit,
		values.from as string | undefined,
		values.to as string | undefined,
	);

	if (values.json) {
		process.stdout.write(JSON.stringify(transcripts, null, 2));
		return;
	}

	if (transcripts.length === 0) {
		process.stdout.write("No transcripts found.\n");
		return;
	}

	for (const [i, t] of transcripts.entries()) {
		process.stdout.write(`${i + 1}. ${t.title}\n`);
		process.stdout.write(`   ID: ${t.id}\n`);
		if (t.dateString) process.stdout.write(`   Date: ${t.dateString}\n`);
		if (t.duration != null)
			process.stdout.write(
				`   Duration: ${Math.floor(t.duration / 60)}m ${Math.floor(t.duration % 60)}s\n`,
			);
		if (t.summary?.overview)
			process.stdout.write(`   Overview: ${t.summary.overview}\n`);
		process.stdout.write("\n");
	}
}

async function handleSearch(
	client: FirefliesApiClient,
	args: string[],
): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			json: { type: "boolean", default: false },
			limit: { type: "string" },
			from: { type: "string" },
			to: { type: "string" },
		},
		allowPositionals: true,
		strict: false,
	});

	const query = positionals[0];
	if (!query) {
		process.stderr.write("Usage: fireflies-mcp search <query> [options]\n");
		process.exit(1);
	}

	const limit = values.limit
		? Number.parseInt(values.limit as string, 10)
		: undefined;
	const transcripts = await client.searchTranscripts(
		query,
		limit,
		values.from as string | undefined,
		values.to as string | undefined,
	);

	if (values.json) {
		process.stdout.write(JSON.stringify(transcripts, null, 2));
		return;
	}

	process.stdout.write(
		`Found ${transcripts.length} transcript(s) matching "${query}"\n\n`,
	);

	for (const [i, t] of transcripts.entries()) {
		process.stdout.write(`${i + 1}. ${t.title}\n`);
		process.stdout.write(`   ID: ${t.id}\n`);
		if (t.dateString) process.stdout.write(`   Date: ${t.dateString}\n`);
		if (t.duration != null)
			process.stdout.write(
				`   Duration: ${Math.floor(t.duration / 60)}m ${Math.floor(t.duration % 60)}s\n`,
			);
		process.stdout.write("\n");
	}
}

async function handleDetails(
	client: FirefliesApiClient,
	args: string[],
): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			json: { type: "boolean", default: false },
		},
		allowPositionals: true,
		strict: false,
	});

	const transcriptId = positionals[0];
	if (!transcriptId) {
		process.stderr.write(
			"Usage: fireflies-mcp details <transcript-id> [options]\n",
		);
		process.exit(1);
	}

	const transcript = await client.getTranscriptDetails(transcriptId, true);

	if (values.json) {
		process.stdout.write(JSON.stringify(transcript, null, 2));
		return;
	}

	process.stdout.write(`Title: ${transcript.title}\n`);
	if (transcript.dateString)
		process.stdout.write(`Date: ${transcript.dateString}\n`);
	if (transcript.duration != null)
		process.stdout.write(
			`Duration: ${Math.floor(transcript.duration / 60)}m ${Math.floor(transcript.duration % 60)}s\n`,
		);
	if (transcript.participants?.length > 0)
		process.stdout.write(
			`Participants: ${transcript.participants.join(", ")}\n`,
		);

	if (transcript.formatted_text) {
		process.stdout.write(`\n--- Transcript ---\n\n`);
		process.stdout.write(transcript.formatted_text);
		process.stdout.write("\n");
	}

	if (transcript.summary?.overview) {
		process.stdout.write(`\n--- Summary ---\n\n`);
		process.stdout.write(`${transcript.summary.overview}\n`);
	}
}

async function handleSummary(
	client: FirefliesApiClient,
	args: string[],
): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		options: {
			json: { type: "boolean", default: false },
			format: { type: "string", default: "bullet_points" },
		},
		allowPositionals: true,
		strict: false,
	});

	const transcriptId = positionals[0];
	if (!transcriptId) {
		process.stderr.write(
			"Usage: fireflies-mcp summary <transcript-id> [options]\n",
		);
		process.exit(1);
	}

	if (values.json) {
		// For --json, return the raw summary object instead of formatted text
		const transcript = await client.getTranscriptDetails(transcriptId);
		if (transcript.summary) {
			process.stdout.write(JSON.stringify(transcript.summary, null, 2));
		} else {
			process.stdout.write("{}");
		}
		return;
	}

	const summary = await client.generateTranscriptSummary(
		transcriptId,
		values.format as string,
	);
	process.stdout.write(`${summary}\n`);
}
