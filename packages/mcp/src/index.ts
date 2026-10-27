import { OIMDevMcpServer } from './core/OIMDevMcpServer';
import type { TOIMDevMcpOptions } from './types/TOIMDevMcpOptions';

export { OIMDevMcpServer };
export type { TOIMDevMcpOptions };

export function createOIMDevMcpServer(options?: TOIMDevMcpOptions): OIMDevMcpServer {
    return new OIMDevMcpServer(options);
}
