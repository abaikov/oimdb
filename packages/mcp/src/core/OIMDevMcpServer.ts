import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { z } from 'zod';
import { OIMDevBridge } from './OIMDevBridge';
import type { IOIMDevRegistry } from '../interfaces/IOIMDevRegistry';
import type { TOIMDevMcpOptions } from '../types/TOIMDevMcpOptions';

/**
 * Loads an in-process registry from a module path: accepts an `oimDevRegistry` named
 * export, a default export, or a zero-arg factory returning one. Used for
 * offline introspection without a running browser.
 */
async function loadRegistryFromModule(
    path: string
): Promise<IOIMDevRegistry> {
    const url = pathToFileURL(resolvePath(path)).href;
    const mod = (await import(url)) as Record<string, unknown>;
    let candidate: unknown = mod.oimDevRegistry ?? mod.default ?? mod;
    if (typeof candidate === 'function') {
        candidate = await (candidate as () => unknown)();
    }
    if (
        !candidate ||
        typeof (candidate as IOIMDevRegistry).inspect !== 'function' ||
        typeof (candidate as IOIMDevRegistry).dumpString !== 'function'
    ) {
        throw new Error(
            `[OIMDB MCP] Module "${path}" must export a registry exposing ` +
                `inspect() and dumpString() (as an "oimDevRegistry" or default export, ` +
                `or a zero-arg factory returning one).`
        );
    }
    return candidate as IOIMDevRegistry;
}

export class OIMDevMcpServer {
    private readonly mcpServer: McpServer;
    private readonly wsPort: number;
    private readonly bridge: OIMDevBridge;
    private inProcessRegistry: IOIMDevRegistry | null;
    private readonly modelModulePath?: string | undefined;
    private modelModuleLoaded = false;

    constructor(options: TOIMDevMcpOptions = {}) {
        this.wsPort = options.wsPort ?? 7432;
        this.bridge = new OIMDevBridge({
            wsPort: this.wsPort,
            host: options.host ?? '127.0.0.1',
            allowedOrigins: new Set(options.allowedOrigins ?? []),
            logPrefix: '[OIMDB MCP]',
            portInUseHint: 'npx @oimdb/mcp',
            requestTimeoutMessage:
                'Browser response timeout (5s). Is the page active?',
        });
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
    private async getInProcessRegistry(): Promise<IOIMDevRegistry | null> {
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
        return this.requestBrowser('inspect');
    }

    /** Reads the human-readable dump from the in-process model or the browser. */
    private async readDump(): Promise<string> {
        const registry = await this.getInProcessRegistry();
        if (registry) return registry.dumpString();
        return (await this.requestBrowser('dump')) as string;
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
                'Get a human-readable text summary of OIMDB state. Same output as oimDevRegistry.dump(). Reads the connected browser tab or an in-process model when configured.',
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

    private requestBrowser(action: string): Promise<unknown> {
        if (this.bridge.connectedBrowser === null) {
            throw new Error(
                `No browser tab connected to the OIMDB MCP bridge.\n\n` +
                `Live mode — add to your debug entry point:\n` +
                `  import { oimDevRegistry } from '@oimdb/devtools';\n` +
                `  oimDevRegistry.connect(); // connects to ws://localhost:${this.wsPort}\n` +
                `Then reload the page.\n\n` +
                `Offline mode — point the server at a model module instead:\n` +
                `  OIMDB_MODEL_MODULE=./path/to/model.js npx @oimdb/mcp\n` +
                `(the module exports an "oimDevRegistry" with inspect()/dumpString()).`
            );
        }
        return this.bridge.request(action);
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
            this.bridge.start();
        }
        const transport = new StdioServerTransport();
        await this.mcpServer.connect(transport);
    }
}
