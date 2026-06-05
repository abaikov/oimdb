/**
 * Writes `value` at `path` inside `root`, creating intermediate objects as
 * needed. Mutates `root` in place.
 */
export function setPath(
    root: Record<string, unknown>,
    path: readonly string[],
    value: unknown
): void {
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!node[key] || typeof node[key] !== 'object') node[key] = {};
        node = node[key] as Record<string, unknown>;
    }
    node[path[path.length - 1]] = value;
}
