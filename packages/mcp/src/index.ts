import { OIMDevMcpServer } from './core/OIMDevMcpServer';
import { OIMDevUIServer } from './core/OIMDevUIServer';
import type { TOIMDevMcpOptions } from './types/TOIMDevMcpOptions';
import type { TOIMDevUIServerOptions } from './types/TOIMDevUIServerOptions';

export { OIMDevMcpServer, OIMDevUIServer };
export type { TOIMDevMcpOptions, TOIMDevUIServerOptions };
export type { IOIMDevRegistry } from './interfaces/IOIMDevRegistry';

export function createOIMDevMcpServer(options?: TOIMDevMcpOptions): OIMDevMcpServer {
    return new OIMDevMcpServer(options);
}

export function createOIMDevUIServer(options: TOIMDevUIServerOptions): OIMDevUIServer {
    return new OIMDevUIServer(options);
}
