/**
 * One-shot CDP inspector: connects to Chrome, evaluates __OIMDB_DEV__.inspect(),
 * prints JSON to stdout. Pipe to jq or paste into an AI prompt.
 *
 * Requirements:
 *   Launch Chrome with: --remote-debugging-port=9222
 *   (or set CDP_URL env var to point to a different address)
 *
 * Usage:
 *   npx @oimdb/mcp cdp
 *   OIMDB_CDP_URL=http://localhost:9222 npx @oimdb/mcp cdp
 *   npx @oimdb/mcp cdp | jq .collections
 */

const cdpBase = process.env.OIMDB_CDP_URL || 'http://localhost:9222';

async function run() {
    // 1. List open tabs
    let tabs;
    try {
        const res = await fetch(`${cdpBase}/json/list`);
        tabs = await res.json();
    } catch {
        process.stderr.write(
            `[OIMDB CDP] Cannot reach Chrome at ${cdpBase}\n` +
            `Launch Chrome with: --remote-debugging-port=9222\n`
        );
        process.exit(1);
    }

    // Find first tab that has a debugger URL
    const tab = tabs.find((t) => t.webSocketDebuggerUrl);
    if (!tab) {
        process.stderr.write('[OIMDB CDP] No debuggable tabs found.\n');
        process.exit(1);
    }

    process.stderr.write(`[OIMDB CDP] Connected to: ${tab.title} (${tab.url})\n`);

    // 2. Open CDP WebSocket
    const { WebSocket } = await import('ws');
    const ws = new WebSocket(tab.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('CDP timeout (5s)'));
        }, 5000);

        ws.once('open', () => {
            ws.send(JSON.stringify({
                id: 1,
                method: 'Runtime.evaluate',
                params: {
                    expression: [
                        '(function(){',
                        '  if(!window.__OIMDB_DEV__) return null;',
                        '  return JSON.parse(JSON.stringify(window.__OIMDB_DEV__.inspect()));',
                        '})()',
                    ].join(''),
                    returnByValue: true,
                    awaitPromise: false,
                },
            }));
        });

        ws.on('message', (raw) => {
            const msg = JSON.parse(raw.toString());
            if (msg.id !== 1) return;
            clearTimeout(timeout);
            ws.close();

            const val = msg.result?.result?.value;
            if (val === null || val === undefined) {
                process.stderr.write(
                    '[OIMDB CDP] __OIMDB_DEV__ not found on this page.\n' +
                    'Make sure debug.ts sets: window.__OIMDB_DEV__ = registry\n'
                );
                process.exit(1);
            }
            process.stdout.write(JSON.stringify(val, null, 2) + '\n');
            resolve(undefined);
        });

        ws.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/** Run the one-shot CDP snapshot (`cdp` subcommand). */
module.exports = function runCdp() {
    run().catch((err) => {
        process.stderr.write('[OIMDB CDP] Error: ' + err.message + '\n');
        process.exit(1);
    });
};
