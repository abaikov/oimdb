import { oimReadOwnChild } from './oimReadOwnChild';

export function oimGetPath(root: unknown, path: readonly string[]): unknown {
    let node = root;
    for (let i = 0; i < path.length; i++) {
        if (node === null || typeof node !== 'object') return undefined;
        node = oimReadOwnChild(node as Record<string, unknown>, path[i]);
    }
    return node;
}
