import { oimReadOwnChild } from './oimReadOwnChild';

const putOwnProperty = (node: Record<string, unknown>, key: string, value: unknown): void => {
    Object.defineProperty(node, key, { value, writable: true, enumerable: true, configurable: true });
};

export function oimSetPath(root: Record<string, unknown>, path: readonly string[], value: unknown): void {
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        const child = oimReadOwnChild(node, key);
        if (child === null || typeof child !== 'object') putOwnProperty(node, key, {});
        node = node[key] as Record<string, unknown>;
    }
    putOwnProperty(node, path[path.length - 1], value);
}
