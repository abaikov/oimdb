# @oimdb/mcp

The MCP server for OIMDB. It gives an AI assistant the tools `oimdb_inspect`, `oimdb_dump`,
`oimdb_collection` and `oimdb_computed` over a live browser tab or an in-process model. It is built on
`@oimdb/cli`, which answers the same four questions from a shell: an assistant that can run a command
can use `npx @oimdb/cli inspect` instead.

📖 **[Full documentation](https://oimdb.org/)**

## For AI Assistants

**Check whether MCP is already configured.** Look for `mcpServers.oimdb` in `.claude/settings.json` or
`~/.claude/settings.json`. If it is there, call `oimdb_inspect` now to see the current state.

**If MCP is not configured yet**, add this to the project's MCP config (Claude Code: `.claude/settings.json`,
Cursor: `.cursor/mcp.json`):

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

Then ask the user to reload the assistant so the server starts, and to make sure the page connects to the
bridge:

```ts
// src/debug.ts
import './store/users.debug';
import './store/tasks.debug';
import { OIM_DEV_REGISTRY } from '@oimdb/devtools';

if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__OIMDB_DEV__ = OIM_DEV_REGISTRY;
    OIM_DEV_REGISTRY.connect(); // connects to ws://localhost:7432
}
```

## Available MCP Tools

| Tool | Description |
|---|---|
| `oimdb_inspect` | Full structured state — collections with their index keys and relations, computeds, flush history, errors |
| `oimdb_dump` | Human-readable text summary — what `OIM_DEV_REGISTRY.dumpString()` returns |
| `oimdb_collection` | Details of one collection by name |
| `oimdb_computed` | Current value of one registered computed, by name |

## Offline / static mode (no browser)

```bash
OIMDB_MODEL_MODULE=./oimdb-model.js npx @oimdb/mcp
```

The module is the one `@oimdb/cli` reads with `--model`; see its README. No WebSocket port is opened in this
mode. From your own Node process, pass the registry directly:

```ts
import { createOIMDevMcpServer } from '@oimdb/mcp';
import { OIM_DEV_REGISTRY } from '@oimdb/devtools';

await createOIMDevMcpServer({ registry: OIM_DEV_REGISTRY }).start();
```

`createOIMDevMcpServer(options?)` takes `wsPort?` (7432), `registry?`, `modelModulePath?`, `host?`
(`127.0.0.1`) and `allowedOrigins?` (`[]`). The bridge, ports, host and origin rules are `@oimdb/cli`'s and are
described in its README; `OIMDB_WS_PORT`, `OIMDB_HOST`, `OIMDB_ALLOWED_ORIGINS` and `OIMDB_MODEL_MODULE` set them
here too.
