# Architecture

Stub for the Hearthkeep layout. The browser simulation host (Vite + React, port 5173) will talk to the MCP server (Node + TypeScript, `127.0.0.1:8787`) over MCP streamable HTTP. Domain rules live in `packages/core`. Adapters in the default install are SQLite storage, a fictional seed catalog, and mock payment. No AWS services are required.

| Component | Responsibility |
|---|---|
| `apps/mcp-server` | Streamable HTTP endpoint, sessions, header and Origin checks, tools and resources, `/healthz`, `/sim/*` |
| `packages/core` | Domain rules behind a repository interface |
| `apps/simulator` | Device frame, conversation, planner, MCP client, card host, trace, data drawer |

This skeleton serves `GET /healthz` and the simulator shell. Tools, cards, and simulation routes come in later chunks.
