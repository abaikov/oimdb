import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer, WebSocket } from 'ws';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { z } from 'zod';
import {
    IOIMDevRegistryLike,
    TOIMBridgeMessage,
    TOIMDevMcpOptions,
} from '../types/TOIMDevMcpOptions';

/**
 * Loads an in-process registry from a module path: accepts a `registry` named
 * export, a default export, or a zero-arg factory returning one. Used for
 * offline introspection without a running browser.
 */
async function loadRegistryFromModule(
    path: string
): Promise<IOIMDevRegistryLike> {
    const url = pathToFileURL(resolvePath(path)).href;
    const mod = (await import(url)) as Record<string, unknown>;
    let candidate: unknown = mod.registry ?? mod.default ?? mod;
    if (typeof candidate === 'function') {
        candidate = await (candidate as () => unknown)();
    }
    if (
        !candidate ||
        typeof (candidate as IOIMDevRegistryLike).inspect !== 'function' ||
        typeof (candidate as IOIMDevRegistryLike).dumpString !== 'function'
    ) {
        throw new Error(
            `[OIMDB MCP] Module "${path}" must export a registry exposing ` +
                `inspect() and dumpString() (as a "registry" or default export, ` +
                `or a zero-arg factory returning one).`
        );
    }
    return candidate as IOIMDevRegistryLike;
}

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
    private inProcessRegistry: IOIMDevRegistryLike | null;
    private readonly modelModulePath?: string;
    private modelModuleLoaded = false;

    constructor(options: TOIMDevMcpOptions = {}) {
        this.wsPort = options.wsPort ?? 7432;
        this.inProcessRegistry = options.registry ?? null;
        this.modelModulePath = options.modelModulePath;
        this.mcpServer = new McpServer(
            { name: 'oimdb', version: '1.0.0' },
            {
                instructions:
                    'Before using these tools, read the OIMDB API reference so you know how to write correct code: node_modules/@oimdb/core/llms.txt. ' +
                    'Then use oimdb_inspect to see the data model (collections, indexes, computeds). ' +
                    'The source is either a live browser tab (WebSocket bridge) or an in-process model (when a registry / model module is provided) for offline/static introspection.',
            }
        );
        this.registerTools();
    }

    /**
     * Resolves the in-process registry, loading the model module on first use.
     * Returns null when no in-process source is configured (browser-bridge mode).
     */
    private async getInProcessRegistry(): Promise<IOIMDevRegistryLike | null> {
        if (this.inProcessRegistry) return this.inProcessRegistry;
        if (this.modelModulePath && !this.modelModuleLoaded) {
            this.modelModuleLoaded = true;
            this.inProcessRegistry = await loadRegistryFromModule(
                this.modelModulePath
            );
        }
        return this.inProcessRegistry;
    }

    /** Reads the inspect snapshot from the in-process model or the browser. */
    private async readInspect(): Promise<unknown> {
        const registry = await this.getInProcessRegistry();
        if (registry) return registry.inspect();
        return this.queryBrowser('inspect');
    }

    /** Reads the human-readable dump from the in-process model or the browser. */
    private async readDump(): Promise<string> {
        const registry = await this.getInProcessRegistry();
        if (registry) return registry.dumpString();
        return (await this.queryBrowser('dump')) as string;
    }

    private registerTools(): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const server = this.mcpServer as any;
        const nameSchema = { name: z.string().describe('Registered name') };

        server.registerTool('oimdb_inspect', {
            description:
                'Get full state of all registered OIMDB collections and computeds. Returns structured JSON with entity counts, field names, index keys, relations, and computed statuses. Source is the connected browser tab, or an in-process model when one is configured (offline/static — field names appear only if the model holds sample entities).',
        }, async () => {
            const data = await this.readInspect();
            return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
        });

        server.registerTool('oimdb_dump', {
            description:
                'Get a human-readable text summary of OIMDB state. Same output as registry.dump(). Reads the connected browser tab or an in-process model when configured.',
        }, async () => {
            const text = await this.readDump();
            return { content: [{ type: 'text' as const, text }] };
        });

        server.registerTool('oimdb_collection', {
            description:
                'Get details of a specific registered collection: entity count, field names, index keys, and relations.',
            inputSchema: nameSchema,
        }, async ({ name }: { name: string }) => {
            const data = await this.readInspect() as { collections: Record<string, unknown> };
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
            const data = await this.readInspect() as { computeds: Record<string, unknown> };
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
                `Live mode — add to your debug entry point:\n` +
                `  import { registry } from '@oimdb/devtools';\n` +
                `  registry.connect(); // connects to ws://localhost:${this.wsPort}\n` +
                `Then reload the page.\n\n` +
                `Offline mode — point the server at a model module instead:\n` +
                `  OIMDB_MODEL_MODULE=./path/to/model.js npx @oimdb/mcp\n` +
                `(the module exports a "registry" with inspect()/dumpString()).`
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
        // Only run the browser bridge when there is no in-process model to read.
        // In offline/static mode the server needs neither a port nor a browser.
        const registry = await this.getInProcessRegistry();
        if (registry) {
            process.stderr.write(
                '[OIMDB MCP] In-process model loaded — serving offline (no browser bridge).\n'
            );
        } else {
            this.setupWebSocketServer();
        }
        const transport = new StdioServerTransport();
        await this.mcpServer.connect(transport);
    }
}
