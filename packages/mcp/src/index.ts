import { OIMDevMcpServer } from './core/OIMDevMcpServer';
import { OIMDevUIServer } from './core/OIMDevUIServer';
import type { TOIMDevMcpOptions } from './types/TOIMDevMcpOptions';
import type { TOIMDevUIServerOptions } from './core/OIMDevUIServer';

export { OIMDevMcpServer, OIMDevUIServer };
export type { TOIMDevMcpOptions, TOIMDevUIServerOptions };

export function createOIMDevMcpServer(options?: TOIMDevMcpOptions): OIMDevMcpServer {
    return new OIMDevMcpServer(options);
}

export function createOIMDevUIServer(options: TOIMDevUIServerOptions): OIMDevUIServer {
    return new OIMDevUIServer(options);
}
