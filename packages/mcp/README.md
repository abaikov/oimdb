# @oimdb/mcp

Connects AI assistants to a live OIMDB store running in the browser. Provides MCP tools for Claude Code and an optional CDP inspector for any AI that can run a shell command.

📖 **[Full documentation](https://abaikov.github.io/oimdb/)**

## For AI Assistants

If you are an AI assistant and this package is present in the project, you can get live OIMDB state from the running browser tab.

**Check if MCP is already configured** — look for `mcpServers.oimdb` in `.claude/settings.json` or `~/.claude/settings.json`. If it is, the tools `oimdb_inspect`, `oimdb_dump`, `oimdb_collection`, and `oimdb_computed` are available. Call `oimdb_inspect` now to see the current state.

**If MCP is not configured yet**, add this to the project's MCP config:

- Claude Code: `.claude/settings.json`
- Cursor: `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "oimdb": {
      "command": "npx",
      "args": ["-y", "@oimdb/mcp"]
    }
  }
}
```

Then ask the user to:
1. Reload Claude Code so the MCP server starts
2. Make sure `debug.ts` calls `registry.connect()` and the app is running in the browser

**If the user just wants a one-shot snapshot** without MCP setup, run this via Bash (requires Chrome launched with `--remote-debugging-port=9222`):

```bash
npx @oimdb/mcp cdp
```

## Human Setup

### Standalone DevTools UI (for humans)

```bash
npx @oimdb/mcp devtools
```

Opens `http://localhost:7433` automatically. Shows live collections and computeds from the running browser tab. No Chrome extension needed.

```bash
OIMDB_WS_PORT=7433 OIMDB_UI_PORT=7434 npx @oimdb/mcp devtools   # custom ports
npx @oimdb/mcp devtools --no-open                                 # don't open browser
```

### 1. Add MCP config (for AI tools)

Claude Code — `.claude/settings.json`:

```json
{
  "mcpServers": {
    "oimdb": {
      "command": "npx",
      "args": ["-y", "@oimdb/mcp"]
    }
  }
}
```

Cursor — `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "oimdb": {
      "command": "npx",
      "args": ["-y", "@oimdb/mcp"]
    }
  }
}
```

### 2. Connect the browser

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

### 3. Use from Claude

```
Call oimdb_inspect to see what's in the store.
```

## Available MCP Tools

| Tool | Description |
|---|---|
| `oimdb_inspect` | Full structured state — all collections, computeds, dep graph |
| `oimdb_dump` | Human-readable text summary (same as `registry.dump()`) |
| `oimdb_collection` | Details of one collection by name |
| `oimdb_computed` | Status + deps of one computed by name |

## Offline / static mode (no browser)

By default the tools read a **live browser tab**. You can instead point the
server at an **in-process model** so it answers offline — ideal for "what's the
data model?" questions without running the app.

**CLI — a model module.** Set `OIMDB_MODEL_MODULE` to a module that builds the
model in Node and exports a `registry` (or a default export, or a zero-arg
factory returning one):

```ts
// oimdb-model.js  (built JS, or run the server under a TS loader)
import { OIMEventQueue, OIMReactiveCollection } from '@oimdb/core';
import { OIMDevRegistry } from '@oimdb/devtools';

const queue = new OIMEventQueue();
const users = new OIMReactiveCollection(queue, { selectPk: u => u.id });

export const registry = new OIMDevRegistry();
registry.collection('users', users, { indexes: { /* ... */ } });
```

```bash
OIMDB_MODEL_MODULE=./oimdb-model.js npx @oimdb/mcp
```

No WebSocket port is opened in this mode — no browser required.

**Embedded — inject a registry.** When running the server from your own Node
process, pass the registry directly:

```ts
import { createOIMDevMcpServer } from '@oimdb/mcp';
import { registry } from './oimdb-model';

await createOIMDevMcpServer({ registry }).start();
```

> **Fields offline:** structure (collections, indexes, relations) is available
> as soon as the model is constructed. Entity **field names** appear only when
> the model holds at least one sample entity (TypeScript types are erased at
> runtime) — seed a representative row in the model module if you want them.

## CDP Inspector (no browser-side code needed)

Launch Chrome with `--remote-debugging-port=9222`, then:

```bash
npx @oimdb/mcp cdp
npx @oimdb/mcp cdp | jq .collections
OIMDB_CDP_URL=http://localhost:9222 npx @oimdb/mcp cdp
```

## Port

The MCP bridge WebSocket runs on port `7432` by default. Change it:

```bash
OIMDB_WS_PORT=7433 npx @oimdb/mcp
```

Update `registry.connect()` accordingly:

```ts
registry.connect('ws://localhost:7433');
```
