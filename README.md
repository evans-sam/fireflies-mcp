# Fireflies MCP Server

MCP Server for the Fireflies.ai API, enabling transcript retrieval, search, and summary generation.

### Features

- **Transcript Management**: Retrieve and search meeting transcripts with filtering options
- **Detailed Information**: Get comprehensive details about specific transcripts
- **Advanced Search**: Find transcripts containing specific keywords or phrases
- **Summary Generation**: Generate concise summaries of meeting transcripts in different formats

## Tools

1. `fireflies_get_transcripts`
   - Retrieve a list of meeting transcripts with optional filtering
   - Inputs:
     - `limit` (optional number): Maximum number of transcripts to return
     - `from_date` (optional string): Start date in ISO format (YYYY-MM-DD)
     - `to_date` (optional string): End date in ISO format (YYYY-MM-DD)
   - Returns: Array of transcript objects with basic information

2. `fireflies_get_transcript_details`
   - Get detailed information about a specific transcript
   - Inputs:
     - `transcript_id` (string): ID of the transcript to retrieve
   - Returns: Comprehensive transcript details including speakers, content, and metadata

3. `fireflies_search_transcripts`
   - Search for transcripts containing specific keywords
   - Inputs:
     - `query` (string): Search query to find relevant transcripts
     - `limit` (optional number): Maximum number of transcripts to return
   - Returns: Array of matching transcript objects

4. `fireflies_generate_summary`
   - Generate a summary of a meeting transcript
   - Inputs:
     - `transcript_id` (string): ID of the transcript to summarize
     - `format` (optional string): Format of the summary ('bullet_points' or 'paragraph')
   - Returns: Generated summary text

## Setup

### Fireflies API Key
[Create a Fireflies API Key](https://fireflies.ai/dashboard/settings/api) with appropriate permissions:
   - Go to the Fireflies.ai dashboard
   - Navigate to Settings > API
   - Generate a new API key
   - Copy the generated key

### Usage with Claude Desktop (stdio)

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fireflies": {
      "command": "bun",
      "args": ["run", "/path/to/fireflies-mcp/src/index.ts"],
      "env": {
        "FIREFLIES_API_KEY": "<YOUR_API_KEY>"
      }
    }
  }
}
```

### Usage with Docker (HTTP)

For a persistent server accessible over HTTP:

```bash
# With docker-compose (recommended)
FIREFLIES_API_KEY=your_api_key docker compose up -d

# Or directly
docker build -t fireflies-mcp .
docker run -d -p 127.0.0.1:3000:3000 -e FIREFLIES_API_KEY=your_api_key fireflies-mcp
```

Then configure your MCP client to connect to `http://localhost:3000/mcp` using the StreamableHTTP transport.

## Installation

1. Clone this repository
2. Install [Bun](https://bun.sh) if not already installed
3. Install dependencies:

```bash
bun install
```

## Development

```bash
# Start the server (stdio mode)
FIREFLIES_API_KEY=your_api_key bun run start

# Start in HTTP mode
FIREFLIES_API_KEY=your_api_key TRANSPORT=http bun run start

# Run tests
bun test

# Lint and format
bun run lint
bun run format

# Type check
bun run typecheck
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FIREFLIES_API_KEY` | Yes | — | Your Fireflies.ai API key |
| `TRANSPORT` | No | `stdio` | Transport mode: `stdio` or `http` |
| `PORT` | No | `3000` | HTTP server port (only used when `TRANSPORT=http`) |

## License

This MCP server is licensed under the MIT License.
