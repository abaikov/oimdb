/**
 * Removes the value located at `path` inside `root`. No-op when an
 * intermediate node is missing or is not an object. Mutates `root` in place.
 */
export function deletePath(
    root: Record<string, unknown>,
    path: readonly string[]
): void {
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
        const next = node[path[i]];
        if (!next || typeof next !== 'object') return;
        node = next as Record<string, unknown>;
    }
    delete node[path[path.length - 1]];
}
