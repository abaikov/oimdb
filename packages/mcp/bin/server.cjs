const { OIMDevMcpServer } = require('../dist/index.cjs');

/** Start the MCP server (default subcommand). */
module.exports = function runMcpServer() {
    const wsPort = process.env.OIMDB_WS_PORT
        ? Number(process.env.OIMDB_WS_PORT)
        : 7432;
    // Offline/static mode: point at a module that builds the model in-process.
    const modelModulePath = process.env.OIMDB_MODEL_MODULE || undefined;
    const server = new OIMDevMcpServer({ wsPort, modelModulePath });
    server.start().catch(err => {
        process.stderr.write('[OIMDB MCP] Fatal: ' + err.message + '\n');
        process.exit(1);
    });
};
