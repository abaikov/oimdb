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
const sub = process.argv[2];

if (sub === undefined || sub === 'mcp' || sub === 'serve') {
    require('./server.cjs')();
} else {
    process.stderr.write(
        `[OIMDB] Unknown command: ${sub}\n` +
            'Usage: oimdb-mcp  (the MCP server). The DevTools UI and the CDP snapshot are in @oimdb/cli: oimdb serve, oimdb inspect --cdp.\n'
    );
    process.exit(1);
}
