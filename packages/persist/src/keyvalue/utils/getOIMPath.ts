import { readOIMOwnChild } from './readOIMOwnChild';

export function getOIMPath(root: unknown, path: readonly string[]): unknown {
    let node = root;
    for (let i = 0; i < path.length; i++) {
        if (node === null || typeof node !== 'object') return undefined;
        node = readOIMOwnChild(node as Record<string, unknown>, path[i]);
    }
    return node;
}
