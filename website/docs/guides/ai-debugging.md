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

### When to use each

| | MCP server | CDP |
|---|---|---|
| Setup | Configure once per project | Launch Chrome with a flag |
| Connection | Persistent, live | One-shot |
| Page changes needed | `registry.connect()` | None (`window.__OIMDB_DEV__` only) |
| Best for | Active debugging sessions | Quick one-off inspection |
