#!/usr/bin/env node
const { OIMDevMcpServer } = require('../dist/index.cjs');

const wsPort = process.env.OIMDB_WS_PORT ? Number(process.env.OIMDB_WS_PORT) : 7432;
const server = new OIMDevMcpServer({ wsPort });
server.start().catch((err) => {
    process.stderr.write('[OIMDB MCP] Fatal: ' + err.message + '\n');
    process.exit(1);
});
