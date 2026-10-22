const path = require('path');
const { OIMDevUIServer } = require('../dist/index.cjs');

/** Start the standalone DevTools UI server (`devtools` subcommand). */
module.exports = function runDevtools() {
    const wsPort = process.env.OIMDB_WS_PORT
        ? Number(process.env.OIMDB_WS_PORT)
        : 7432;
    const uiPort = process.env.OIMDB_UI_PORT
        ? Number(process.env.OIMDB_UI_PORT)
        : 7433;
    const noOpen = process.argv.includes('--no-open');
    const uiDir = path.join(__dirname, '../ui');
    // Loopback unless told otherwise. This port hands out the application's
    // whole data model, so binding every interface — which is what happens when
    // no host is given — puts it on the café Wi-Fi.
    const host = process.env.OIMDB_HOST || '127.0.0.1';
    // Exact page origins, comma-separated. Never '*'.
    const allowedOrigins = (process.env.OIMDB_ALLOWED_ORIGINS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const server = new OIMDevUIServer({ wsPort, uiPort, uiDir, open: !noOpen, host, allowedOrigins });
    server.start();
};
