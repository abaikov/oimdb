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

    const server = new OIMDevUIServer({ wsPort, uiPort, uiDir, open: !noOpen });
    server.start();
};
