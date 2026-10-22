# @oimdb/mcp

Connects AI assistants to a live OIMDB store running in the browser. It provides MCP tools for Claude Code, plus an optional CDP inspector for any AI that can run a shell command.

📖 **[Full documentation](https://oimdb.org/)**

## For AI Assistants

If you are an AI assistant and this package is present in the project, you can get live OIMDB state from the running browser tab.

**Check whether MCP is already configured.** Look for `mcpServers.oimdb` in `.claude/settings.json` or `~/.claude/settings.json`. If it is there, the tools `oimdb_inspect`, `oimdb_dump`, `oimdb_collection` and `oimdb_computed` are available. Call `oimdb_inspect` now to see the current state.

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
2. Make sure `debug.ts` calls `oimDevRegistry.connect()` and the app is running in the browser

**If the user just wants a one-shot snapshot** without MCP setup, run this via Bash (requires Chrome launched with `--remote-debugging-port=9222`):

```bash
npx @oimdb/mcp cdp
```

## Human Setup

### Standalone DevTools UI (for humans)

```bash
npx @oimdb/mcp devtools
```

Opens `http://localhost:7433` automatically and shows live collections and computeds from the running browser tab. No Chrome extension is needed.

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

The app calls `oimInitDevtools()` once at startup, before it builds its first
service, where it builds the database (see the `@oimdb/devtools` README, Setup).
The debug entry point then only connects:

```ts
// src/debug.ts
import './store/users.debug';
import './store/tasks.debug';
import { oimDevRegistry } from '@oimdb/devtools';

if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__OIMDB_DEV__ = oimDevRegistry;
    oimDevRegistry.connect(); // connects to ws://localhost:7432
}
```

### 3. Use from Claude

```
Call oimdb_inspect to see what's in the store.
```

## Available MCP Tools

| Tool | Description |
|---|---|
| `oimdb_inspect` | Full structured state — collections with their index keys and relations, computeds, flush history, errors |
| `oimdb_dump` | Human-readable text summary — what `oimDevRegistry.dumpString()` returns (`oimDevRegistry.dump()` is the sibling that console-logs it) |
| `oimdb_collection` | Details of one collection by name |
| `oimdb_computed` | Current value of one registered computed, by name |

## Offline / static mode (no browser)

By default the tools read a **live browser tab**. You can instead point the
server at an **in-process model** so it answers offline. This suits "what's the
data model?" questions when you don't want to run the app.

**CLI: a model module.** Set `OIMDB_MODEL_MODULE` to a module that builds the
model in Node and exports an `oimDevRegistry` (or a default export, or a zero-arg
factory that returns one). It calls `oimInitDevtools()` before it builds the first
service, as every app using `@oimdb/devtools` does:

```ts
// oimdb-model.js  (built JS, or run the server under a TS loader)
import {
    OIMDB, createOIMBucketService, createOIMEntityService, type TOIMEntitySlot,
} from '@oimdb/core';
import { OIMDevRegistry, oimInitDevtools } from '@oimdb/devtools';

oimInitDevtools();

type TUser = { id: string; name: string; role: string };

const db = new OIMDB();
const usersService = createOIMEntityService<TUser>(db, { keyOf: (user) => user.id });
const users = usersService.createStoreSlot(db);
// A bucket's slots are the caller's — a write to a user moves the value and
// files nothing, so whoever writes the user also calls
// `usersByRoleService.slotContentService.writeBucketMemberSlots(bucketSlot, entitySlots)`.
const usersByRoleService = createOIMBucketService<TOIMEntitySlot<TUser>>(db);
const usersByRole = usersByRoleService.createStoreSlot(db);

export const oimDevRegistry = new OIMDevRegistry();
// The bucket collection and its store slot — you constructed them, so you hand them over.
oimDevRegistry.collection('users', usersService, users, {
    indexes: { byRole: { bucketCollectionService: usersByRoleService, bucketStoreSlot: usersByRole } },
});
```

The server asks a registry for only two methods, `inspect()` and `dumpString()`,
declared here as `IOIMDevRegistry`, so this package depends on no `@oimdb`
package at all. `OIMDevRegistry` from `@oimdb/devtools` satisfies it as it
stands, and so does anything else that answers those two.

```bash
OIMDB_MODEL_MODULE=./oimdb-model.js npx @oimdb/mcp
```

No WebSocket port is opened in this mode, and no browser is required.

**Embedded: inject a registry.** When you run the server from your own Node
process, pass the registry directly:

```ts
import { createOIMDevMcpServer } from '@oimdb/mcp';
import { oimDevRegistry } from '@oimdb/devtools';

await createOIMDevMcpServer({ registry: oimDevRegistry }).start();
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

## Ports, host and origins

Everything here is configured through **environment variables**. The only CLI
flag in the package is `devtools --no-open`.

| Variable | Default | What it sets |
|---|---|---|
| `OIMDB_WS_PORT` | `7432` | The bridge WebSocket port |
| `OIMDB_UI_PORT` | `7433` | The `devtools` UI HTTP port |
| `OIMDB_HOST` | `127.0.0.1` | The interface both servers bind to |
| `OIMDB_ALLOWED_ORIGINS` | *(empty)* | Extra page origins allowed onto the bridge, comma-separated |
| `OIMDB_MODEL_MODULE` | — | Offline model module (see above) |
| `OIMDB_CDP_URL` | `http://localhost:9222` | The CDP endpoint the `cdp` subcommand reads |

The same two settings are `host` and `allowedOrigins` on `TOIMDevMcpOptions` and
`TOIMDevUIServerOptions` when you construct a server yourself.

**It binds to loopback by default, on purpose.** This port hands out the
application's entire data model, and a `WebSocketServer` built with no host
binds every interface, which would put the model on the café Wi-Fi.
Set `OIMDB_HOST=0.0.0.0` when the browser really runs
somewhere else (a container, a VM, a phone), and accept that everyone who can
route there can talk to it. Both servers print the bound host at startup.

**Origins are checked, and `'*'` is never allowed.** A request with no `Origin` header is
allowed (that is a non-browser client). A loopback origin is allowed
(`localhost`, `127.0.0.1`, `::1`, `[::1]`, `*.localhost`). Anything else is
allowed only if you listed it exactly in `OIMDB_ALLOWED_ORIGINS`. The literal
string `null` is always rejected, because a sandboxed iframe on any site in the world
sends exactly that. Only an allow-listed origin gets
`Access-Control-Allow-Origin` echoed back.

While bound to a loopback host, the UI server also rejects a request whose
`Host` header is not a loopback authority, with **421 Misdirected request**.
This is the DNS-rebinding guard, and it is switched off when you bind elsewhere.

Change the bridge port and update `oimDevRegistry.connect()` accordingly:

```bash
OIMDB_WS_PORT=7433 npx @oimdb/mcp
```

```ts
import { oimDevRegistry } from '@oimdb/devtools';

oimDevRegistry.connect('ws://localhost:7433');
```

## Running a server from your own process

```ts
import { createOIMDevMcpServer, createOIMDevUIServer } from '@oimdb/mcp';
```

- **`createOIMDevMcpServer(options?)`** → `OIMDevMcpServer`. Options: `wsPort?`
  (7432), `registry?`, `modelModulePath?`, `host?` (`127.0.0.1`),
  `allowedOrigins?` (`[]`).
- **`createOIMDevUIServer(options)`** → `OIMDevUIServer`. Options: `wsPort?`
  (7432), `uiPort?` (7433), **`uiDir` — required, no default**, `open?` (true),
  `host?` (`127.0.0.1`), `allowedOrigins?` (`[]`).

Both classes are exported too, along with `TOIMDevMcpOptions`,
`TOIMDevUIServerOptions` and `IOIMDevRegistry`.

Know these three behaviours before you wire this into anything:

- **The newest browser tab takes the bridge**, and the previous socket is closed
  with "Replaced by a newer OIMDB DevTools tab". Only the socket that currently
  holds the bridge may answer a request; anything else is ignored.
- **A query times out after 5 seconds**, reported as "Browser response timeout
  (5s). Is the page active?".
- **A malformed frame drops that client** with close code 1007, and `EADDRINUSE`
  exits the process with a message naming the env var to change.

The `devtools` UI serves `/`, `/index.html`, `/app.js`, `/app.css`, plus
`/api/inspect`, which answers `{ connected, tab, data }`:

```bash
curl http://127.0.0.1:7433/api/inspect
```

## Subcommands

```bash
npx @oimdb/mcp             # the MCP server; `mcp` and `serve` are accepted aliases
npx @oimdb/mcp devtools    # the standalone UI
npx @oimdb/mcp cdp         # one-shot snapshot over the Chrome DevTools Protocol
```
