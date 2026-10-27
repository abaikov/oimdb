#!/usr/bin/env node
const path = require('path');
const {
    OIMDevUIServer, OIMDevStateReader, OIMDevModuleStateSource, OIMDevHttpStateSource, OIMDevCdpStateSource,
} = require('../dist/index.cjs');

const USAGE = [
    'Usage:',
    '  oimdb inspect                 every registered collection and computed, as JSON',
    '  oimdb dump                    the same as readable text',
    '  oimdb collection <name>       one registered collection',
    '  oimdb computed <name>         one registered computed',
    '  oimdb serve [--no-open]       the bridge a page connects to, the DevTools UI and /api/inspect, /api/dump',
    '  oimdb mcp                     the MCP server (needs @oimdb/mcp installed)',
    '',
    'Where the read commands get the state (one of):',
    '  --model <module>              a module that builds the model in this process',
    '  --cdp [url]                   Chrome over the DevTools Protocol (default http://localhost:9222)',
    '  --url <url>                   a running "oimdb serve" (default http://localhost:7433)',
].join('\n');

const args = process.argv.slice(2);
const command = args[0];

const flagValue = (name) => {
    const at = args.indexOf(name);
    if (at < 0) return undefined;
    const next = args[at + 1];
    return next === undefined || next.startsWith('--') ? '' : next;
};

const envList = (name) => (process.env[name] || '').split(',').map(entry => entry.trim()).filter(Boolean);

const devStateSourceOf = () => {
    const modelModulePath = flagValue('--model') ?? process.env.OIMDB_MODEL_MODULE;
    if (modelModulePath) return new OIMDevModuleStateSource(modelModulePath);
    const cdpUrl = flagValue('--cdp');
    if (cdpUrl !== undefined) return new OIMDevCdpStateSource(cdpUrl || process.env.OIMDB_CDP_URL || 'http://localhost:9222');
    const uiPort = process.env.OIMDB_UI_PORT || '7433';
    return new OIMDevHttpStateSource(flagValue('--url') || `http://localhost:${uiPort}`);
};

const read = async (readText) => {
    try {
        process.stdout.write(await readText(new OIMDevStateReader(devStateSourceOf())) + '\n');
    } catch (error) {
        process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
        process.exit(1);
    }
};

const requireName = () => {
    const name = args[1];
    if (name === undefined || name.startsWith('--')) {
        process.stderr.write(`oimdb ${command}: name the ${command}.\n\n${USAGE}\n`);
        process.exit(1);
    }
    return name;
};

if (command === 'inspect') {
    read(reader => reader.readInspectText());
} else if (command === 'dump') {
    read(reader => reader.readDumpText());
} else if (command === 'collection') {
    const name = requireName();
    read(reader => reader.readCollectionText(name));
} else if (command === 'computed') {
    const name = requireName();
    read(reader => reader.readComputedText(name));
} else if (command === 'serve') {
    new OIMDevUIServer({
        wsPort: process.env.OIMDB_WS_PORT ? Number(process.env.OIMDB_WS_PORT) : 7432,
        uiPort: process.env.OIMDB_UI_PORT ? Number(process.env.OIMDB_UI_PORT) : 7433,
        uiDir: path.join(__dirname, '../ui'),
        open: !args.includes('--no-open'),
        host: process.env.OIMDB_HOST || '127.0.0.1',
        allowedOrigins: envList('OIMDB_ALLOWED_ORIGINS'),
    }).start();
} else if (command === 'mcp') {
    let mcp;
    try {
        mcp = require('@oimdb/mcp');
    } catch {
        process.stderr.write('oimdb mcp: install @oimdb/mcp next to @oimdb/cli.\n');
        process.exit(1);
    }
    mcp.createOIMDevMcpServer({
        wsPort: process.env.OIMDB_WS_PORT ? Number(process.env.OIMDB_WS_PORT) : 7432,
        modelModulePath: flagValue('--model') || process.env.OIMDB_MODEL_MODULE || undefined,
        host: process.env.OIMDB_HOST || '127.0.0.1',
        allowedOrigins: envList('OIMDB_ALLOWED_ORIGINS'),
    }).start().catch(error => {
        process.stderr.write(`[OIMDB MCP] Fatal: ${error.message}\n`);
        process.exit(1);
    });
} else {
    process.stderr.write(`${USAGE}\n`);
    process.exit(command === undefined || command === '--help' || command === 'help' ? 0 : 1);
}
