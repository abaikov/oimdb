import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { join, extname } from 'path';
import { exec } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { TOIMBridgeMessage } from '../types/TOIMDevMcpOptions';

export type TOIMDevUIServerOptions = {
    wsPort?: number;
    uiPort?: number;
    uiDir: string;
    open?: boolean;
};

type TOIMPendingRequest = {
    resolve: (data: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

type TOIMConnectedBrowser = {
    ws: WebSocket;
    url: string;
    title: string;
};

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
};

export class OIMDevUIServer {
    private readonly wsPort: number;
    private readonly uiPort: number;
    private readonly uiDir: string;
    private readonly shouldOpen: boolean;
    private wss: WebSocketServer | null = null;
    private latestBrowser: TOIMConnectedBrowser | null = null;
    private readonly pending = new Map<string, TOIMPendingRequest>();

    constructor(options: TOIMDevUIServerOptions) {
        this.wsPort = options.wsPort ?? 7432;
        this.uiPort = options.uiPort ?? 7433;
        this.uiDir = options.uiDir;
        this.shouldOpen = options.open ?? true;
    }

    private async queryBrowser(action: string): Promise<unknown> {
        if (!this.latestBrowser) return null;
        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).slice(2);
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('timeout'));
            }, 5000);
            this.pending.set(id, { resolve, reject, timer });
            this.latestBrowser!.ws.send(JSON.stringify({ type: 'request', id, action }));
        });
    }

    private setupBridge(): void {
        this.wss = new WebSocketServer({ port: this.wsPort });

        this.wss.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                process.stderr.write(
                    `[OIMDB DevTools] Port ${this.wsPort} is already in use.\n` +
                    `Set a different port: OIMDB_WS_PORT=7433 npx @oimdb/mcp devtools\n`
                );
                process.exit(1);
            }
            process.stderr.write(`[OIMDB DevTools] Bridge error: ${err.message}\n`);
            process.exit(1);
        });

        this.wss.on('connection', (ws) => {
            ws.on('message', (raw) => {
                const msg = JSON.parse(raw.toString()) as TOIMBridgeMessage;

                if (msg.type === 'hello') {
                    this.latestBrowser = { ws, url: msg.url, title: msg.title };
                    process.stderr.write(`[OIMDB DevTools] Browser connected: ${msg.title} (${msg.url})\n`);
                    return;
                }

                if (msg.type === 'response') {
                    const req = this.pending.get(msg.id);
                    if (!req) return;
                    this.pending.delete(msg.id);
                    clearTimeout(req.timer);
                    if (msg.error) req.reject(new Error(msg.error));
                    else req.resolve(msg.data);
                }
            });

            ws.on('close', () => {
                if (this.latestBrowser?.ws === ws) {
                    this.latestBrowser = null;
                    process.stderr.write('[OIMDB DevTools] Browser disconnected\n');
                }
            });
        });

        process.stderr.write(`[OIMDB DevTools] Bridge on ws://localhost:${this.wsPort}\n`);
    }

    private setupHTTP(): void {
        const server = createServer((req: IncomingMessage, res: ServerResponse) => {
            const url = req.url ?? '/';
            res.setHeader('Access-Control-Allow-Origin', '*');

            if (url === '/api/inspect') {
                this.queryBrowser('inspect')
                    .then((data) => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            connected: !!this.latestBrowser,
                            tab: this.latestBrowser
                                ? { url: this.latestBrowser.url, title: this.latestBrowser.title }
                                : null,
                            data,
                        }));
                    })
                    .catch(() => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ connected: false, tab: null, data: null }));
                    });
                return;
            }

            const filePath = join(this.uiDir, url === '/' ? 'index.html' : url);
            try {
                const content = readFileSync(filePath);
                res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'text/plain' });
                res.end(content);
            } catch {
                res.writeHead(404);
                res.end('Not found');
            }
        });

        server.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                process.stderr.write(
                    `[OIMDB DevTools] UI port ${this.uiPort} is already in use.\n` +
                    `Set a different port: OIMDB_UI_PORT=7434 npx @oimdb/mcp devtools\n`
                );
                process.exit(1);
            }
        });

        server.listen(this.uiPort, () => {
            const uiUrl = `http://localhost:${this.uiPort}`;
            process.stderr.write(`[OIMDB DevTools] UI ready → ${uiUrl}\n`);
            if (this.shouldOpen) this.openURL(uiUrl);
        });
    }

    private openURL(url: string): void {
        const cmd = process.platform === 'win32' ? `start "" "${url}"`
                  : process.platform === 'darwin' ? `open "${url}"`
                  : `xdg-open "${url}"`;
        exec(cmd, (err) => {
            if (err) process.stderr.write(`[OIMDB DevTools] Could not open browser: ${err.message}\n`);
        });
    }

    public start(): void {
        this.setupBridge();
        this.setupHTTP();
        process.stderr.write(
            `[OIMDB DevTools] Add to debug.ts: registry.connect();\n`
        );
    }
}
