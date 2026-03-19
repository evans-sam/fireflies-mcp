#!/bin/bash
set -e

echo "Setting up Fireflies MCP Server..."

echo "Installing dependencies..."
bun install

echo "Setup complete! Run the server with:"
echo "FIREFLIES_API_KEY=your_api_key bun run start"
