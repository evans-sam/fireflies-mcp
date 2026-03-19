import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

export class FirefliesApiClient {
	private baseUrl: string;
	private apiKey: string;

	constructor(apiKey: string) {
		this.baseUrl = "https://api.fireflies.ai/graphql";
		this.apiKey = apiKey;
	}

	private async executeQuery(
		query: string,
		variables: Record<string, any> = {},
	): Promise<any> {
		process.stderr.write(
			`Executing GraphQL query with variables: ${JSON.stringify(variables)}\n`,
		);

		let response: Response;
		try {
			response = await fetch(this.baseUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ query, variables }),
				signal: AbortSignal.timeout(60000),
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") {
				throw new McpError(
					ErrorCode.InternalError,
					"API request timed out after 60 seconds",
				);
			}
			if (error instanceof DOMException && error.name === "TimeoutError") {
				throw new McpError(
					ErrorCode.InternalError,
					"API request timed out after 60 seconds",
				);
			}
			throw new McpError(
				ErrorCode.InternalError,
				`API request failed: ${(error as Error).message}`,
			);
		}

		if (!response.ok) {
			process.stderr.write(`Response status: ${response.status}\n`);
			if (response.status === 400) {
				const data = await response.json().catch(() => ({}));
				throw new McpError(
					ErrorCode.InvalidParams,
					`Bad request: ${data?.message || "Invalid request parameters"}`,
				);
			}
			if (response.status === 401) {
				throw new McpError(
					ErrorCode.InvalidRequest,
					"Invalid API key or unauthorized access",
				);
			}
			if (response.status === 404) {
				throw new McpError(ErrorCode.InvalidParams, "Resource not found");
			}
			throw new McpError(
				ErrorCode.InternalError,
				`API request failed with status ${response.status}`,
			);
		}

		const data = await response.json();

		if (data.errors) {
			process.stderr.write(`GraphQL errors: ${JSON.stringify(data.errors)}\n`);
			throw new Error(`GraphQL error: ${data.errors[0].message}`);
		}

		return data.data;
	}

	async getTranscripts(
		limit?: number,
		fromDate?: string,
		toDate?: string,
		minimal: boolean = false,
	): Promise<any[]> {
		const actualLimit = limit || 20;

		process.stderr.write(
			`Getting transcripts with limit: ${actualLimit}, fromDate: ${fromDate || "not specified"}, toDate: ${toDate || "not specified"}, minimal: ${minimal}\n`,
		);

		let query: string;

		if (minimal) {
			query = `
        query Transcripts($limit: Int, $skip: Int, $fromDate: DateTime, $toDate: DateTime) {
          transcripts(limit: $limit, skip: $skip, fromDate: $fromDate, toDate: $toDate) {
            id
            title
            date
          }
        }
      `;
		} else {
			query = `
        query Transcripts($limit: Int, $skip: Int, $fromDate: DateTime, $toDate: DateTime) {
          transcripts(limit: $limit, skip: $skip, fromDate: $fromDate, toDate: $toDate) {
            id
            title
            date
            dateString
            duration
            transcript_url
            speakers { id name }
            summary { keywords overview }
          }
        }
      `;
		}

		const variables: Record<string, any> = {
			limit: actualLimit,
			skip: 0,
		};

		if (fromDate) {
			variables.fromDate = fromDate;
			process.stderr.write(`Using fromDate: ${fromDate}\n`);
		}

		if (toDate) {
			variables.toDate = toDate;
			process.stderr.write(`Using toDate: ${toDate}\n`);
		}

		process.stderr.write(
			`Executing getTranscripts query with variables: ${JSON.stringify(variables)}\n`,
		);
		const startTime = Date.now();

		try {
			const data = await this.executeQuery(query, variables);
			const endTime = Date.now();
			process.stderr.write(
				`getTranscripts query completed in ${endTime - startTime}ms\n`,
			);

			const transcripts = data.transcripts || [];
			process.stderr.write(`Retrieved ${transcripts.length} transcripts\n`);

			if (transcripts.length <= 1) {
				process.stderr.write(
					`WARNING: Only ${transcripts.length} transcript(s) returned. This might be due to:\n`,
				);
				process.stderr.write(`1. Limited data in your Fireflies account\n`);
				process.stderr.write(`2. Date filters restricting results\n`);
				process.stderr.write(`3. API permissions or visibility settings\n`);
			}

			return transcripts;
		} catch (error) {
			process.stderr.write(
				`Error in getTranscripts: ${error instanceof Error ? error.message : String(error)}\n`,
			);

			if (
				!minimal &&
				error instanceof Error &&
				error.message.includes("timed out")
			) {
				process.stderr.write(`Retrying with minimal fields...\n`);
				return this.getTranscripts(actualLimit, fromDate, toDate, true);
			}

			throw error;
		}
	}

	async getTranscriptDetails(
		transcriptId: string,
		formatText: boolean = false,
	): Promise<any> {
		const query = `
      query Transcript($transcriptId: String!) {
        transcript(id: $transcriptId) {
          id
          dateString
          privacy
          speakers { id name }
          sentences {
            index
            speaker_name
            speaker_id
            text
            raw_text
            start_time
            end_time
            ai_filters { task pricing metric question date_and_time text_cleanup sentiment }
          }
          title
          host_email
          organizer_email
          calendar_id
          user { user_id email name num_transcripts recent_meeting minutes_consumed is_admin integrations }
          fireflies_users
          participants
          date
          transcript_url
          audio_url
          video_url
          duration
          meeting_attendees { displayName email phoneNumber name location }
          summary {
            keywords action_items outline shorthand_bullet overview
            bullet_gist gist short_summary short_overview meeting_type
            topics_discussed transcript_chapters
          }
          cal_id
          calendar_type
          apps_preview { outputs { transcript_id user_id app_id created_at title prompt response } }
          meeting_link
        }
      }
    `;

		const variables = { transcriptId };

		try {
			process.stderr.write(
				`Getting transcript details for ID: ${transcriptId}\n`,
			);
			const data = await this.executeQuery(query, variables);
			const transcript = data.transcript;

			if (!transcript) {
				throw new McpError(
					ErrorCode.InvalidParams,
					`Transcript with ID ${transcriptId} not found`,
				);
			}

			if (
				formatText &&
				transcript.sentences &&
				transcript.sentences.length > 0
			) {
				const formattedText = transcript.sentences
					.map((sentence: any) => {
						return `${sentence.speaker_name}: ${sentence.text}`;
					})
					.join("\n");

				transcript.formatted_text = formattedText;

				transcript.sentences = transcript.sentences.map((sentence: any) => ({
					index: sentence.index,
					speaker_name: sentence.speaker_name,
					text: sentence.text,
				}));
			}

			return transcript;
		} catch (error) {
			process.stderr.write(
				`Error getting transcript details: ${error instanceof Error ? error.message : String(error)}\n`,
			);
			throw error;
		}
	}

	async searchTranscripts(
		searchQuery: string,
		limit?: number,
		fromDate?: string,
		toDate?: string,
	): Promise<any[]> {
		const query = `
      query Transcripts($title: String, $limit: Int, $skip: Int, $fromDate: DateTime, $toDate: DateTime) {
        transcripts(title: $title, limit: $limit, skip: $skip, fromDate: $fromDate, toDate: $toDate) {
          id
          title
          date
          dateString
          duration
          transcript_url
          speakers { id name }
          summary { keywords overview }
        }
      }
    `;

		const actualLimit = limit || 20;

		process.stderr.write(
			`Searching transcripts with query: "${searchQuery}", limit: ${actualLimit}, fromDate: ${fromDate || "not specified"}, toDate: ${toDate || "not specified"}\n`,
		);

		const variables: Record<string, any> = {
			title: searchQuery,
			limit: actualLimit,
			skip: 0,
		};

		if (fromDate) {
			variables.fromDate = fromDate;
			process.stderr.write(`Using fromDate: ${fromDate}\n`);
		}

		if (toDate) {
			variables.toDate = toDate;
			process.stderr.write(`Using toDate: ${toDate}\n`);
		}

		try {
			process.stderr.write(`Executing searchTranscripts query...\n`);
			const startTime = Date.now();

			const data = await this.executeQuery(query, variables);

			const endTime = Date.now();
			process.stderr.write(
				`searchTranscripts query completed in ${endTime - startTime}ms\n`,
			);

			const transcripts = data.transcripts || [];
			process.stderr.write(
				`Found ${transcripts.length} matching transcripts\n`,
			);

			return transcripts;
		} catch (error) {
			process.stderr.write(
				`Error in searchTranscripts: ${error instanceof Error ? error.message : String(error)}\n`,
			);
			throw error;
		}
	}

	async generateTranscriptSummary(
		transcriptId: string,
		format: string = "bullet_points",
	): Promise<string> {
		const query = `
      query Transcript($transcriptId: String!) {
        transcript(id: $transcriptId) {
          id
          title
          summary { keywords action_items overview topics_discussed }
        }
      }
    `;

		const variables = { transcriptId };

		try {
			process.stderr.write(
				`Generating summary for transcript ID: ${transcriptId}\n`,
			);
			const data = await this.executeQuery(query, variables);
			const transcript = data.transcript;

			if (!transcript || !transcript.summary) {
				throw new McpError(
					ErrorCode.InvalidParams,
					"Summary not available for this transcript",
				);
			}

			process.stderr.write(
				`Summary structure: ${JSON.stringify(transcript.summary)}\n`,
			);

			const isArray = (field: any): boolean => Array.isArray(field);

			const safeJoin = (field: any, separator: string): string => {
				if (isArray(field)) {
					return field.join(separator);
				} else if (field && typeof field === "string") {
					return field;
				} else if (field) {
					return String(field);
				}
				return "";
			};

			if (format === "bullet_points") {
				const bullets = [];

				if (transcript.summary.overview) {
					bullets.push(`Overview: ${transcript.summary.overview}`);
				}

				if (transcript.summary.action_items) {
					if (
						isArray(transcript.summary.action_items) &&
						transcript.summary.action_items.length > 0
					) {
						bullets.push("Action Items:");
						transcript.summary.action_items.forEach((item: string) => {
							bullets.push(`- ${item}`);
						});
					} else if (
						typeof transcript.summary.action_items === "string" &&
						transcript.summary.action_items.trim()
					) {
						bullets.push("Action Items:");
						bullets.push(`- ${transcript.summary.action_items}`);
					}
				}

				if (transcript.summary.topics_discussed) {
					if (
						isArray(transcript.summary.topics_discussed) &&
						transcript.summary.topics_discussed.length > 0
					) {
						bullets.push("Topics Discussed:");
						transcript.summary.topics_discussed.forEach((topic: string) => {
							bullets.push(`- ${topic}`);
						});
					} else if (
						typeof transcript.summary.topics_discussed === "string" &&
						transcript.summary.topics_discussed.trim()
					) {
						bullets.push("Topics Discussed:");
						bullets.push(`- ${transcript.summary.topics_discussed}`);
					}
				}

				if (transcript.summary.keywords) {
					if (
						isArray(transcript.summary.keywords) &&
						transcript.summary.keywords.length > 0
					) {
						bullets.push(`Keywords: ${transcript.summary.keywords.join(", ")}`);
					} else if (
						typeof transcript.summary.keywords === "string" &&
						transcript.summary.keywords.trim()
					) {
						bullets.push(`Keywords: ${transcript.summary.keywords}`);
					}
				}

				return bullets.join("\n");
			} else {
				let summary = "";

				if (transcript.summary.overview) {
					summary += `${transcript.summary.overview} `;
				}

				if (transcript.summary.topics_discussed) {
					summary += `Topics discussed include: ${safeJoin(transcript.summary.topics_discussed, "; ")}. `;
				}

				if (transcript.summary.action_items) {
					summary += `Action items include: ${safeJoin(transcript.summary.action_items, "; ")}. `;
				}

				if (transcript.summary.keywords) {
					summary += `Key topics: ${safeJoin(transcript.summary.keywords, ", ")}.`;
				}

				return summary;
			}
		} catch (error) {
			process.stderr.write(
				`Error generating summary: ${error instanceof Error ? error.message : String(error)}\n`,
			);
			throw error;
		}
	}
}
