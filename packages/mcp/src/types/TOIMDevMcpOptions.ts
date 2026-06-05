/**
 * The readable shape the MCP tools need from a registry — `OIMDevRegistry` from
 * `@oimdb/devtools` already satisfies it. Declared structurally (following the
 * existing `IOIMDev*Like` convention) so `@oimdb/mcp` need not depend on
 * `@oimdb/devtools`; it is not a separate registry implementation.
 */
export interface IOIMDevRegistryLike {
    inspect(): unknown;
    dumpString(): string;
}

export type TOIMDevMcpOptions = {
    /** Port for the WebSocket bridge that browser tabs connect to. Default: 7432 */
    wsPort?: number;
    /**
     * An in-process registry to read directly (your `OIMDevRegistry`). When
     * provided, the tools answer from it without a browser/WebSocket bridge
     * (no `wsPort` server started).
     */
    registry?: IOIMDevRegistryLike;
    /**
     * Path to a module that builds the model in this process for offline
     * introspection. The module must export a `registry` (or a default export,
     * or a zero-arg factory) exposing `inspect()` and `dumpString()`.
     * Also settable via the `OIMDB_MODEL_MODULE` env var for the CLI.
     */
    modelModulePath?: string;
};

export type TOIMBridgeHello = {
    type: 'hello';
    url: string;
    title: string;
    timestamp: number;
};

export type TOIMBridgeResponse = {
    type: 'response';
    id: string;
    data: unknown;
    error?: string;
};

export type TOIMBridgeMessage = TOIMBridgeHello | TOIMBridgeResponse;
