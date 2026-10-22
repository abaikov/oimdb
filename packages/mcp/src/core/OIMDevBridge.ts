import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import { OIMDevBridgeMessageReader } from './OIMDevBridgeMessageReader';
import { OIMDevLoopbackPolicy } from './OIMDevLoopbackPolicy';
import type { TOIMDevBridgeOptions } from '../types/TOIMDevBridgeOptions';
import type { TOIMDevConnectedBrowser } from '../types/TOIMDevConnectedBrowser';
import type { TOIMDevPendingRequest } from '../types/TOIMDevPendingRequest';

const OIM_REQUEST_TIMEOUT_MS = 5000;

export class OIMDevBridge {
    private readonly messageReader = new OIMDevBridgeMessageReader();
    private readonly pending = new Map<string, TOIMDevPendingRequest>();
    private webSocketServer: WebSocketServer | null = null;
    private devConnectedBrowser: TOIMDevConnectedBrowser | null = null;

    constructor(private readonly bridgeOptions: TOIMDevBridgeOptions) {}

    public get connectedBrowser(): TOIMDevConnectedBrowser | null {
        return this.devConnectedBrowser;
    }

    /**
     * May a page use this bridge?
     *
     * From this machine, or named by whoever started the server. An ABSENT
     * origin is a non-browser client — a CLI, a test — and is allowed; the
     * literal `'null'` is not, because a sandboxed iframe on any site can send
     * exactly that.
     */
    public isOriginAllowed(origin: string | undefined): boolean {
        if (origin === undefined || origin === '') return true;
        if (this.bridgeOptions.allowedOrigins.has(origin)) return true;
        return OIMDevLoopbackPolicy.isLoopbackOrigin(origin);
    }

    public request(action: string): Promise<unknown> {
        const browser = this.devConnectedBrowser;
        if (browser === null) {
            return Promise.reject(
                new Error(this.bridgeOptions.requestTimeoutMessage)
            );
        }
        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).slice(2);
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(this.bridgeOptions.requestTimeoutMessage));
            }, OIM_REQUEST_TIMEOUT_MS);

            this.pending.set(id, { resolve, reject, timer });
            browser.ws.send(JSON.stringify({ type: 'request', id, action }));
        });
    }

    public start(): void {
        this.webSocketServer = new WebSocketServer({
            port: this.bridgeOptions.wsPort,
            host: this.bridgeOptions.host,
            verifyClient: (info: { origin: string }) =>
                this.isOriginAllowed(info.origin),
        });

        this.webSocketServer.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                this.write(
                    `Port ${this.bridgeOptions.wsPort} is already in use.\n`
                );
                process.stderr.write(
                    `Set a different port: OIMDB_WS_PORT=7433 ${this.bridgeOptions.portInUseHint}\n`
                );
                process.exit(1);
            }
            this.write(`Bridge error: ${err.message}\n`);
            process.exit(1);
        });

        this.webSocketServer.on('connection', ws => {
            // A socket with no error listener throws out of the emitter on a
            // reset, which is process death by another route.
            ws.on('error', (err: Error) => {
                this.write(`Bridge socket error: ${err.message}\n`);
            });

            ws.on('message', raw => this.readFrame(ws, raw.toString()));

            ws.on('close', () => {
                if (this.devConnectedBrowser?.ws === ws) {
                    this.devConnectedBrowser = null;
                    this.write('Browser disconnected\n');
                }
            });
        });

        this.write(
            `Bridge ready on ws://localhost:${this.bridgeOptions.wsPort} (bound to ${this.bridgeOptions.host})\n`
        );
    }

    private readFrame(ws: WebSocket, raw: string): void {
        const devBridgeMessage = this.messageReader.read(raw);
        if (devBridgeMessage === null) {
            // Frames here are machine-written, so one that is not a bridge
            // message means the peer is not the devtools registry: there is
            // nothing to answer and no id to answer it under.
            this.write('Dropping a client that sent a malformed frame\n');
            ws.close(1007, 'Malformed bridge message');
            return;
        }

        if (devBridgeMessage.type === 'hello') {
            this.adoptBrowser(ws, devBridgeMessage.url, devBridgeMessage.title);
            return;
        }

        // ONLY THE SOCKET THAT HOLDS THE BRIDGE MAY ANSWER. Any other client on
        // this port could otherwise resolve a pending request with data of its
        // choosing — and that data is what the panel, or the assistant, then
        // reads as the application's model.
        if (this.devConnectedBrowser?.ws !== ws) return;

        const devPendingRequest = this.pending.get(devBridgeMessage.id);
        if (!devPendingRequest) return;
        this.pending.delete(devBridgeMessage.id);
        clearTimeout(devPendingRequest.timer);
        if (devBridgeMessage.error) devPendingRequest.reject(new Error(devBridgeMessage.error));
        else devPendingRequest.resolve(devBridgeMessage.data);
    }

    /**
     * Newest tab wins — a reload is the ordinary reason for a second `hello` —
     * but the tab it displaces is CLOSED and the swap is printed. Overwriting the
     * field in place leaves the displaced socket open for ever and lets a second
     * connection take the bridge over in silence.
     */
    private adoptBrowser(ws: WebSocket, url: string, title: string): void {
        const previousDevConnectedBrowser = this.devConnectedBrowser;
        this.devConnectedBrowser = { ws, url, title };
        if (previousDevConnectedBrowser !== null && previousDevConnectedBrowser.ws !== ws) {
            this.write(
                `Bridge taken over by "${title}" (${url}); dropping "${previousDevConnectedBrowser.title}"\n`
            );
            previousDevConnectedBrowser.ws.close(1000, 'Replaced by a newer OIMDB DevTools tab');
            return;
        }
        this.write(`Browser connected: ${title} (${url})\n`);
    }

    private write(line: string): void {
        process.stderr.write(`${this.bridgeOptions.logPrefix} ${line}`);
    }
}
