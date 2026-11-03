import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
    OIMDevBridge, OIMDevBridgeStateSource, OIMDevModuleStateSource, OIMDevRegistryStateSource, OIMDevStateReader,
} from '@oimdb/cli';
import type { IOIMDevStateSource } from '@oimdb/cli';
import type { TOIMDevMcpOptions } from '../types/TOIMDevMcpOptions';

export class OIMDevMcpServer {
    private readonly mcpServer: McpServer;
    private readonly devBridge: OIMDevBridge | undefined;
    private readonly devModuleStateSource: OIMDevModuleStateSource | undefined;
    private readonly devStateReader: OIMDevStateReader;

    constructor(options: TOIMDevMcpOptions = {}) {
        const wsPort = options.wsPort ?? 7432;
        let devStateSource: IOIMDevStateSource;
        if (options.registry !== undefined) {
            devStateSource = new OIMDevRegistryStateSource(options.registry);
        } else if (options.modelModulePath !== undefined) {
            this.devModuleStateSource = new OIMDevModuleStateSource(options.modelModulePath);
            devStateSource = this.devModuleStateSource;
        } else {
            this.devBridge = new OIMDevBridge({
                wsPort,
                host: options.host ?? '127.0.0.1',
                allowedOrigins: new Set(options.allowedOrigins ?? []),
                logPrefix: '[OIMDB MCP]',
                portInUseHint: 'npx @oimdb/mcp',
                requestTimeoutMessage: 'Browser response timeout (5s). Is the page active?',
            });
            devStateSource = new OIMDevBridgeStateSource(this.devBridge, wsPort);
        }
        this.devStateReader = new OIMDevStateReader(devStateSource);
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

    private registerTools(): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const server = this.mcpServer as any;
        const nameSchema = { name: z.string().describe('Registered name') };
        const asText = (text: string) => ({ content: [{ type: 'text' as const, text }] });

        server.registerTool('oimdb_inspect', {
            description:
                'Get full state of all registered OIMDB collections and computeds. Returns structured JSON with entity counts, field names, index keys, relations, and computed statuses. Source is the connected browser tab, or an in-process model when one is configured (offline/static — field names appear only if the model holds sample entities).',
        }, async () => asText(await this.devStateReader.readInspectText()));

        server.registerTool('oimdb_dump', {
            description:
                'Get a human-readable text summary of OIMDB state. Same output as OIM_DEV_REGISTRY.dump(). Reads the connected browser tab or an in-process model when configured.',
        }, async () => asText(await this.devStateReader.readDumpText()));

        server.registerTool('oimdb_collection', {
            description:
                'Get details of a specific registered collection: entity count, field names, index keys, and relations.',
            inputSchema: nameSchema,
        }, async ({ name }: { name: string }) => asText(await this.devStateReader.readCollectionText(name)));

        server.registerTool('oimdb_computed', {
            description:
                'Get status and resolved dependency names of a specific registered computed value. Shows fresh/stale/pending status, current value, and which registered sources it depends on.',
            inputSchema: nameSchema,
        }, async ({ name }: { name: string }) => asText(await this.devStateReader.readComputedText(name)));
    }

    public async start(): Promise<void> {
        if (this.devModuleStateSource !== undefined) await this.devModuleStateSource.loadDevRegistry();
        if (this.devBridge !== undefined) this.devBridge.start();
        else process.stderr.write('[OIMDB MCP] In-process model loaded — serving offline (no browser bridge).\n');
        await this.mcpServer.connect(new StdioServerTransport());
    }
}
