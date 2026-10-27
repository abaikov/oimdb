# @oimdb/cli

The OIMDB command line. It reads the state of a live page, of a model module or of Chrome over the
DevTools Protocol, and runs the bridge a page connects to with the DevTools UI. An AI assistant that can run a
shell command needs nothing else; one that cannot uses `@oimdb/mcp`, which answers the same four questions as
MCP tools.

📖 **[Full documentation](https://oimdb.org/)**

## Commands

```bash
npx @oimdb/cli inspect               # every registered collection and computed, as JSON
npx @oimdb/cli dump                  # the same as readable text
npx @oimdb/cli collection <name>     # one registered collection
npx @oimdb/cli computed <name>       # one registered computed
npx @oimdb/cli serve [--no-open]     # the bridge, the DevTools UI, /api/inspect and /api/dump
npx @oimdb/cli mcp                   # the MCP server (needs @oimdb/mcp installed)
```

`inspect`, `dump`, `collection` and `computed` print to stdout and exit with `1` and a message on stderr when the
state cannot be read. Their output is exactly what the `@oimdb/mcp` tools `oimdb_inspect`, `oimdb_dump`,
`oimdb_collection` and `oimdb_computed` return.

## Where the state comes from

| Flag | Source |
|---|---|
| *(none)* | a running `oimdb serve`, at `http://localhost:7433` (or `OIMDB_UI_PORT`) |
| `--url <url>` | a running `oimdb serve` elsewhere |
| `--model <module>` | a module that builds the model in this process (or `OIMDB_MODEL_MODULE`) |
| `--cdp [url]` | Chrome launched with `--remote-debugging-port=9222` (or `OIMDB_CDP_URL`); no page code needed beyond `window.__OIMDB_DEV__ = oimDevRegistry` |

### A live page: `serve`, then read

```bash
npx @oimdb/cli serve           # opens the UI at http://localhost:7433
npx @oimdb/cli inspect         # in another terminal
```

The page connects to the bridge from its debug entry point:

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

### A model module, no browser

The module builds the model in Node and exports an `oimDevRegistry` (or a default export, or a zero-arg factory
that returns one). It calls `oimInitDevtools()` before it builds the first service:

```ts
// oimdb-model.js  (built JS, or run the server under a TS loader)
import { OIMDB, type TOIMEntitySlot, createOIMSlotContentEntityService, createOIMSlotCollectionService, OIMSlotContentPositionalArrayBucketService, OIMBucketCommands } from '@oimdb/core';
import { OIMDevRegistry, oimInitDevtools } from '@oimdb/devtools';

oimInitDevtools();

type TUser = { id: string; name: string; role: string };

const db = new OIMDB();
const usersService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TUser>(db) });
const users = usersService.createStoreSlot(db);
// A bucket's slots are the caller's — a write to a user moves the value and
// files nothing, so whoever writes the user also calls
// `usersByRoleService.slotContentService.writeSlotContent(bucketSlot, entitySlots)`.
const usersByRoleService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TOIMEntitySlot<TUser>>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }) });
const usersByRole = usersByRoleService.createStoreSlot(db);

export const oimDevRegistry = new OIMDevRegistry();
// The bucket collection and its store slot — you constructed them, so you hand them over.
oimDevRegistry.collection('users', usersService, users, {
    indexes: { byRole: { bucketCollectionService: usersByRoleService, bucketStoreSlot: usersByRole } },
});
```

```bash
npx @oimdb/cli inspect --model ./oimdb-model.js
```

A registry is asked for only `inspect()` and `dumpString()` (`IOIMDevRegistry`), so this package depends on no
other `@oimdb` package. Entity **field names** appear only when the model holds at least one sample entity.

## Ports, host and origins

| Variable | Default | What it sets |
|---|---|---|
| `OIMDB_WS_PORT` | `7432` | The bridge WebSocket port |
| `OIMDB_UI_PORT` | `7433` | The `serve` UI HTTP port, and where the read commands look by default |
| `OIMDB_HOST` | `127.0.0.1` | The interface `serve` binds to |
| `OIMDB_ALLOWED_ORIGINS` | *(empty)* | Extra page origins allowed onto the bridge, comma-separated |
| `OIMDB_MODEL_MODULE` | — | The model module, when `--model` is not given |
| `OIMDB_CDP_URL` | `http://localhost:9222` | The CDP endpoint, when `--cdp` names none |

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

`serve` answers `/`, `/index.html`, `/app.js`, `/app.css`, `/api/inspect` (`{ connected, tab, data }`) and
`/api/dump` (`{ connected, data }`).

- **The newest browser tab takes the bridge**, and the previous socket is closed
  with "Replaced by a newer OIMDB DevTools tab". Only the socket that currently
  holds the bridge may answer a request; anything else is ignored.
- **A query times out after 5 seconds**, reported as "Browser response timeout
  (5s). Is the page active?".
- **A malformed frame drops that client** with close code 1007, and `EADDRINUSE`
  exits the process with a message naming the env var to change.

## From your own process

```ts
import { OIMDevStateReader, OIMDevModuleStateSource, OIMDevUIServer } from '@oimdb/cli';

const devStateReader = new OIMDevStateReader(new OIMDevModuleStateSource('./oimdb-model.js'));
console.log(await devStateReader.readInspectText());
```

The sources are `OIMDevRegistryStateSource`, `OIMDevModuleStateSource`, `OIMDevBridgeStateSource`,
`OIMDevHttpStateSource` and `OIMDevCdpStateSource`, all `IOIMDevStateSource`. `OIMDevUIServer` and
`OIMDevBridge` are the servers `serve` runs.
