const { OIMDevMcpServer } = require('../dist/index.cjs');

/** Start the MCP server (default subcommand). */
module.exports = function runMcpServer() {
    const wsPort = process.env.OIMDB_WS_PORT
        ? Number(process.env.OIMDB_WS_PORT)
        : 7432;
    // Offline/static mode: point at a module that builds the model in-process.
    const modelModulePath = process.env.OIMDB_MODEL_MODULE || undefined;
    // Loopback unless told otherwise. This port hands out the application's
    // whole data model, so binding every interface — which is what happens when
    // no host is given — puts it on the café Wi-Fi.
    const host = process.env.OIMDB_HOST || '127.0.0.1';
    // Exact page origins, comma-separated. Never '*'.
    const allowedOrigins = (process.env.OIMDB_ALLOWED_ORIGINS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    const server = new OIMDevMcpServer({ wsPort, modelModulePath, host, allowedOrigins });
    server.start().catch(err => {
        process.stderr.write('[OIMDB MCP] Fatal: ' + err.message + '\n');
        process.exit(1);
    });
};
