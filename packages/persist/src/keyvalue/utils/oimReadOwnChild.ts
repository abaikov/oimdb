export function oimReadOwnChild(node: Record<string, unknown>, key: string): unknown {
    return Object.prototype.hasOwnProperty.call(node, key) ? node[key] : undefined;
}
