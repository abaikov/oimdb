import { WebSocket } from 'ws';
import type { IOIMDevStateSource } from '../interfaces/IOIMDevStateSource';

const OIM_CDP_TIMEOUT_MS = 5000;

export class OIMDevCdpStateSource implements IOIMDevStateSource {
    constructor(private readonly cdpUrl: string) {}

    public readInspect(): Promise<unknown> {
        return this.evaluate('JSON.parse(JSON.stringify(window.__OIMDB_DEV__.inspect()))');
    }

    public async readDump(): Promise<string> {
        return (await this.evaluate('window.__OIMDB_DEV__.dumpString()')) as string;
    }

    private async evaluate(expression: string): Promise<unknown> {
        let tabs: { webSocketDebuggerUrl?: string }[];
        try {
            tabs = await (await fetch(`${this.cdpUrl}/json/list`)).json() as { webSocketDebuggerUrl?: string }[];
        } catch {
            throw new Error(`[OIMDB CDP] Cannot reach Chrome at ${this.cdpUrl}. Launch Chrome with --remote-debugging-port=9222.`);
        }
        const debuggerUrl = tabs.find(tab => tab.webSocketDebuggerUrl !== undefined)?.webSocketDebuggerUrl;
        if (debuggerUrl === undefined) throw new Error('[OIMDB CDP] No debuggable tabs found.');
        const value = await this.evaluateOnTab(debuggerUrl, `(function(){ if (!window.__OIMDB_DEV__) return null; return ${expression}; })()`);
        if (value === null || value === undefined) {
            throw new Error('[OIMDB CDP] __OIMDB_DEV__ not found on this page. Set window.__OIMDB_DEV__ = OIM_DEV_REGISTRY in the debug entry.');
        }
        return value;
    }

    private evaluateOnTab(debuggerUrl: string, expression: string): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const webSocket = new WebSocket(debuggerUrl);
            const timeout = setTimeout(() => {
                webSocket.close();
                reject(new Error(`[OIMDB CDP] Timeout (${OIM_CDP_TIMEOUT_MS / 1000}s).`));
            }, OIM_CDP_TIMEOUT_MS);
            webSocket.once('open', () => {
                webSocket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
            });
            webSocket.on('message', raw => {
                const message = JSON.parse(raw.toString()) as { id?: number; result?: { result?: { value?: unknown } } };
                if (message.id !== 1) return;
                clearTimeout(timeout);
                webSocket.close();
                resolve(message.result?.result?.value);
            });
            webSocket.once('error', error => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
}
