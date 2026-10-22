import { oimReadOwnChild } from './oimReadOwnChild';

export function oimDeletePath(root: Record<string, unknown>, path: readonly string[]): void {
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
        const child = oimReadOwnChild(node, path[i]);
        if (child === null || typeof child !== 'object') return;
        node = child as Record<string, unknown>;
    }
    delete node[path[path.length - 1]];
}
