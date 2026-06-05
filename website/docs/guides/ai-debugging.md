---
sidebar_position: 4
---

# AI Debugging

Two ways to give an AI assistant live access to your OIMDB state.

---

## Option A — MCP server (persistent connection)

`@oimdb/mcp` runs a local server that bridges your browser and Claude Code. Once set up, Claude can call `oimdb_inspect`, `oimdb_dump`, `oimdb_collection`, and `oimdb_computed` as tools — without any copy-paste.

### 1. Install and build

```bash
npm install @oimdb/mcp --save-dev
cd node_modules/@oimdb/mcp && npm run build  # or: npm run build:mcp from monorepo root
```

### 2. Configure Claude Code

Add to `.claude/settings.json` in your project (or global `~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "oimdb": {
      "command": "node",
      "args": ["./node_modules/@oimdb/mcp/bin/server.cjs"]
    }
  }
}
```

Or with a custom WebSocket port:

```json
{
  "mcpServers": {
    "oimdb": {
      "command": "node",
      "args": ["./node_modules/@oimdb/mcp/bin/server.cjs"],
      "env": { "OIMDB_WS_PORT": "7432" }
    }
  }
}
```

### 3. Connect the browser

In your debug entry point:

```ts
// src/debug.ts
import './store/users.debug';
import './store/tasks.debug';
import { registry } from '@oimdb/devtools';

if (typeof window !== 'undefined') {
    (window as Record<string, unknown>).__OIMDB_DEV__ = registry;
    registry.connect(); // connects to ws://localhost:7432
}
```

### 4. Use from Claude

Once the MCP server is running and the page is open, Claude has access to:

| Tool | What it does |
|---|---|
| `oimdb_inspect` | Full structured state — all collections, computeds, deps |
| `oimdb_dump` | Human-readable text summary |
| `oimdb_collection` | Details of one collection by name |
| `oimdb_computed` | Status + deps of one computed by name |

Example prompts:
- *"Check oimdb_inspect and tell me why totalPrice is stale"*
- *"Use oimdb_dump to get an overview of the store, then help me write a selector for open tasks"*

---

## Option B — CDP (one-shot, no browser-side code)

Reads state from a running Chrome tab via the Chrome DevTools Protocol. No WebSocket connection needed on the page — just `window.__OIMDB_DEV__` and Chrome launched with a flag.

### 1. Launch Chrome with remote debugging

```bash
# macOS
open -a "Google Chrome" --args --remote-debugging-port=9222

# or add to your dev script
"dev": "concurrently \"vite\" \"chrome --remote-debugging-port=9222\""
```

### 2. Run the CDP inspector

```bash
# prints OIMDB state JSON to stdout
npx @oimdb/mcp cdp

# pipe to jq for filtering
npx @oimdb/mcp cdp | jq .collections

# custom CDP address
OIMDB_CDP_URL=http://localhost:9222 npx @oimdb/mcp cdp
```

### 3. Use from Claude Code

Claude Code can run this directly via the Bash tool:

```
Run: npx @oimdb/mcp cdp
```

Or paste the output into a prompt manually.

---

## Option C — Offline / in-process model (no browser)

The same MCP tools (`oimdb_inspect`, `oimdb_dump`, `oimdb_collection`, `oimdb_computed`) can read an **in-process model** instead of a live tab — so an assistant can answer *"what's the data model?"* without running the app. Structure (collections, indexes, relations) is available statically; entity field names appear only if the model holds a sample entity (TypeScript types are erased at runtime).

### Via the CLI — a model module

Point the server at a module that builds the model in Node and exports a `registry` (or a default export, or a zero-arg factory):

```ts
// oimdb-model.js  (built JS, or run the server under a TS loader)
import { OIMEventQueue, OIMReactiveCollection } from '@oimdb/core';
import { OIMDevRegistry } from '@oimdb/devtools';

const queue = new OIMEventQueue();
const users = new OIMReactiveCollection(queue, { selectPk: u => u.id });

export const registry = new OIMDevRegistry();
registry.collection('users', users, { indexes: { /* ... */ } });
```

```json
{
  "mcpServers": {
    "oimdb": {
      "command": "node",
      "args": ["./node_modules/@oimdb/mcp/bin/server.cjs"],
      "env": { "OIMDB_MODEL_MODULE": "./oimdb-model.js" }
    }
  }
}
```

No WebSocket port is opened and no browser is required.

### Embedded — inject a registry

When running the server from your own Node process:

```ts
import { createOIMDevMcpServer } from '@oimdb/mcp';
import { registry } from './oimdb-model';

await createOIMDevMcpServer({ registry }).start();
```

### When to use each

| | MCP server (live) | CDP | Offline model |
|---|---|---|---|
| Setup | Configure once per project | Launch Chrome with a flag | Point at a model module |
| Connection | Persistent, live | One-shot | In-process, static |
| Page changes needed | `registry.connect()` | None (`window.__OIMDB_DEV__` only) | None — no browser at all |
| Live data | Yes | Yes | Structure always; fields only if seeded |
| Best for | Active debugging sessions | Quick one-off inspection | "What's the model?" offline |
