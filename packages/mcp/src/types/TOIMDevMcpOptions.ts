import type { IOIMDevRegistry } from '../interfaces/IOIMDevRegistry';

export type TOIMDevMcpOptions = {
    /** Default 7432; unused when `registry` is given — no bridge is started. */
    wsPort?: number;
    registry?: IOIMDevRegistry;
    /** Must export `oimDevRegistry`, a default, or a zero-arg factory. Env: `OIMDB_MODEL_MODULE`. */
    modelModulePath?: string;
    /** LOOPBACK BY DEFAULT: a `WebSocketServer` built without a host binds everything. */
    host?: string;
    /** On top of the loopback origins. Exact, never `'*'`. */
    allowedOrigins?: readonly string[];
};
