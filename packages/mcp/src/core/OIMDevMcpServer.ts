import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { TOIMBridgeMessage, TOIMDevMcpOptions } from '../types/TOIMDevMcpOptions';

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

export class OIMDevMcpServer {
    private readonly mcpServer: McpServer;
    private readonly wsPort: number;
    private wss: WebSocketServer | null = null;
    private latestBrowser: TOIMConnectedBrowser | null = null;
    private readonly pending = new Map<string, TOIMPendingRequest>();

    constructor(options: TOIMDevMcpOptions = {}) {
        this.wsPort = options.wsPort ?? 7432;
        this.mcpServer = new McpServer({ name: 'oimdb', version: '1.0.0' });
        this.registerTools();
    }

    private registerTools(): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const server = this.mcpServer as any;
        const nameSchema = { name: z.string().describe('Registered name') };

        server.registerTool('oimdb_inspect', {
            description:
                'Get full state of all registered OIMDB collections and computeds from the connected browser tab. Returns structured JSON with entity counts, field names, index keys, relations, and computed statuses.',
        }, async () => {
            const data = await this.queryBrowser('inspect');
            return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
        });

        server.registerTool('oimdb_dump', {
            description:
                'Get a human-readable text summary of OIMDB state. Same output as registry.dump() in the browser.',
        }, async () => {
            const text = await this.queryBrowser('dump') as string;
            return { content: [{ type: 'text' as const, text }] };
        });

        server.registerTool('oimdb_collection', {
            description:
                'Get details of a specific registered collection: entity count, field names, index keys, and relations.',
            inputSchema: nameSchema,
        }, async ({ name }: { name: string }) => {
            const data = await this.queryBrowser('inspect') as { collections: Record<string, unknown> };
            const info = data.collections[name];
            if (!info) {
                const available = Object.keys(data.collections).join(', ') || '(none registered)';
                return { content: [{ type: 'text' as const, text: `Collection '${name}' not found. Registered: ${available}` }] };
            }
            return { content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }] };
        });

        server.registerTool('oimdb_computed', {
            description:
                'Get status and resolved dependency names of a specific registered computed value. Shows fresh/stale/pending status, current value, and which registered sources it depends on.',
            inputSchema: nameSchema,
        }, async ({ name }: { name: string }) => {
            const data = await this.queryBrowser('inspect') as { computeds: Record<string, unknown> };
            const info = data.computeds[name];
            if (!info) {
                const available = Object.keys(data.computeds).join(', ') || '(none registered)';
                return { content: [{ type: 'text' as const, text: `Computed '${name}' not found. Registered: ${available}` }] };
            }
            return { content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }] };
        });
    }

    private async queryBrowser(action: string): Promise<unknown> {
        if (!this.latestBrowser) {
            throw new Error(
                `No browser tab connected to the OIMDB MCP bridge.\n\n` +
                `Add to your debug entry point:\n` +
                `  import { registry } from '@oimdb/devtools';\n` +
                `  registry.connect(); // connects to ws://localhost:${this.wsPort}\n\n` +
                `Then reload the page.`
            );
        }

        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).slice(2);
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('Browser response timeout (5s). Is the page active?'));
            }, 5000);

            this.pending.set(id, { resolve, reject, timer });
            this.latestBrowser!.ws.send(JSON.stringify({ type: 'request', id, action }));
        });
    }

    private setupWebSocketServer(): void {
        this.wss = new WebSocketServer({ port: this.wsPort });

        this.wss.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                process.stderr.write(
                    `[OIMDB MCP] Port ${this.wsPort} is already in use.\n` +
                    `Set a different port: OIMDB_WS_PORT=7433 npx @oimdb/mcp\n`
                );
                process.exit(1);
            }
            process.stderr.write(`[OIMDB MCP] WebSocket server error: ${err.message}\n`);
            process.exit(1);
        });

        this.wss.on('connection', (ws) => {
            ws.on('message', (raw) => {
                const msg = JSON.parse(raw.toString()) as TOIMBridgeMessage;

                if (msg.type === 'hello') {
                    this.latestBrowser = { ws, url: msg.url, title: msg.title };
                    process.stderr.write(`[OIMDB MCP] Browser connected: ${msg.title} (${msg.url})\n`);
                    return;
                }

                if (msg.type === 'response') {
                    const pending = this.pending.get(msg.id);
                    if (!pending) return;
                    this.pending.delete(msg.id);
                    clearTimeout(pending.timer);
                    if (msg.error) {
                        pending.reject(new Error(msg.error));
                    } else {
                        pending.resolve(msg.data);
                    }
                }
            });

            ws.on('close', () => {
                if (this.latestBrowser?.ws === ws) {
                    this.latestBrowser = null;
                    process.stderr.write('[OIMDB MCP] Browser disconnected\n');
                }
            });
        });

        process.stderr.write(`[OIMDB MCP] Bridge ready on ws://localhost:${this.wsPort}\n`);
    }

    public async start(): Promise<void> {
        this.setupWebSocketServer();
        const transport = new StdioServerTransport();
        await this.mcpServer.connect(transport);
    }
}
