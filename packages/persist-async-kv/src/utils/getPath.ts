/**
 * Reads the value located at `path` inside `root`.
 * Returns `undefined` when an intermediate node is missing or is not an object.
 */
export function getPath(root: unknown, path: readonly string[]): unknown {
    let node = root as Record<string, unknown> | undefined;
    for (let i = 0; i < path.length; i++) {
        if (!node || typeof node !== 'object') return undefined;
        node = node[path[i]] as Record<string, unknown> | undefined;
    }
    return node;
}
