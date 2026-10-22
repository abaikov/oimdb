import type { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'http';
import { exec } from 'child_process';
import { OIMDevBridge } from './OIMDevBridge';
import { OIMDevLoopbackPolicy } from './OIMDevLoopbackPolicy';
import { OIMDevUIAssetCatalog } from './OIMDevUIAssetCatalog';
import type { TOIMDevUIServerOptions } from '../types/TOIMDevUIServerOptions';

export class OIMDevUIServer {
    private readonly uiPort: number;
    private readonly shouldOpen: boolean;
    private readonly host: string;
    private readonly allowedOrigins: ReadonlySet<string>;
    private readonly devUIAssetCatalog: OIMDevUIAssetCatalog;
    private readonly bridge: OIMDevBridge;

    constructor(options: TOIMDevUIServerOptions) {
        this.uiPort = options.uiPort ?? 7433;
        this.shouldOpen = options.open ?? true;
        this.host = options.host ?? '127.0.0.1';
        this.allowedOrigins = new Set(options.allowedOrigins ?? []);
        this.devUIAssetCatalog = new OIMDevUIAssetCatalog(options.uiDir);
        this.bridge = new OIMDevBridge({
            wsPort: options.wsPort ?? 7432,
            host: this.host,
            allowedOrigins: this.allowedOrigins,
            logPrefix: '[OIMDB DevTools]',
            portInUseHint: 'npx @oimdb/mcp devtools',
            requestTimeoutMessage: 'timeout',
        });
    }

    /**
     * While bound to loopback, answer only what was addressed to a loopback
     * name.
     *
     * Without this, a page on any site can point a hostname it controls at
     * 127.0.0.1 and become same-origin with this server. The `Host` header is
     * the part of that a browser cannot forge. Binding elsewhere is an explicit
     * decision, so the check stands down there.
     */
    private isRequestAddressedHere(req: IncomingMessage): boolean {
        if (!OIMDevLoopbackPolicy.isLoopbackHost(this.host)) return true;
        const host = req.headers.host;
        return host !== undefined && OIMDevLoopbackPolicy.isLoopbackAuthority(host);
    }

    private requestBrowser(action: string): Promise<unknown> {
        if (this.bridge.connectedBrowser === null) return Promise.resolve(null);
        return this.bridge.request(action);
    }

    private setupHTTP(): void {
        const server = createServer((req: IncomingMessage, res: ServerResponse) => {
            if (!this.isRequestAddressedHere(req)) {
                res.writeHead(421);
                res.end('Misdirected request');
                return;
            }

            const origin = req.headers.origin;
            if (origin !== undefined && this.allowedOrigins.has(origin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
            }

            const url = req.url ?? '/';

            if (url.split('?', 1)[0] === '/api/inspect') {
                this.requestBrowser('inspect')
                    .then((data) => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        const connectedBrowser = this.bridge.connectedBrowser;
                        res.end(JSON.stringify({
                            connected: connectedBrowser !== null,
                            tab: connectedBrowser === null
                                ? null
                                : { url: connectedBrowser.url, title: connectedBrowser.title },
                            data,
                        }));
                    })
                    .catch(() => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ connected: false, tab: null, data: null }));
                    });
                return;
            }

            const asset = this.devUIAssetCatalog.resolve(url);
            if (asset === null) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            try {
                res.writeHead(200, { 'Content-Type': asset.contentType });
                res.end(this.devUIAssetCatalog.read(asset));
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

        server.listen(this.uiPort, this.host, () => {
            const uiUrl = `http://localhost:${this.uiPort}`;
            process.stderr.write(`[OIMDB DevTools] UI ready → ${uiUrl} (bound to ${this.host})\n`);
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
        this.bridge.start();
        this.setupHTTP();
        process.stderr.write(
            `[OIMDB DevTools] Add to debug.ts: oimDevRegistry.connect();\n`
        );
    }
}
