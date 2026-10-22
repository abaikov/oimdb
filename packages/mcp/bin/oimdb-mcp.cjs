#!/usr/bin/env node
// The servers catch what they can reach; this is the net for what they cannot.
// It lives in the CLI and NOT in the library classes, because those also run
// embedded in somebody else's process, where deciding that the process survives
// its own uncaught errors is not ours to make. stderr only — MCP mode speaks
// protocol on stdout.
process.on('uncaughtException', err => {
    process.stderr.write(`[OIMDB] Uncaught error (continuing): ${err && err.stack ? err.stack : String(err)}\n`);
});
process.on('unhandledRejection', reason => {
    process.stderr.write(`[OIMDB] Unhandled rejection (continuing): ${String(reason)}\n`);
});
/**
 * Single entry point for @oimdb/mcp. Dispatches on the first argument so all of
 * these work via npx (one bin → npx can always resolve it):
 *
 *   npx @oimdb/mcp            # MCP server (default; for AI tools)
 *   npx @oimdb/mcp devtools   # standalone DevTools UI (for humans)
 *   npx @oimdb/mcp cdp        # one-shot CDP snapshot to stdout
 */
const sub = process.argv[2];

if (sub === 'devtools') {
    require('./devtools.cjs')();
} else if (sub === 'cdp') {
    require('./cdp.cjs')();
} else if (sub === undefined || sub === 'mcp' || sub === 'serve') {
    require('./server.cjs')();
} else {
    process.stderr.write(
        `[OIMDB] Unknown command: ${sub}\n` +
            'Usage: oimdb-mcp [devtools|cdp]  (no argument = MCP server)\n'
    );
    process.exit(1);
}
