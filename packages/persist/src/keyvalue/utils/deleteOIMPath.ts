import { readOIMOwnChild } from './readOIMOwnChild';

export function deleteOIMPath(root: Record<string, unknown>, path: readonly string[]): void {
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
        const child = readOIMOwnChild(node, path[i]);
        if (child === null || typeof child !== 'object') return;
        node = child as Record<string, unknown>;
    }
    delete node[path[path.length - 1]];
}
