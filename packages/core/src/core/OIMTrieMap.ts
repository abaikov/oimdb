/**
 * A trie (prefix tree) keyed by an arbitrary-length path of primitive segments.
 * The N-level generalization of `OIMMap2Keys`: instead of a fixed two-level
 * `Map<K1, Map<K2, V>>`, each path segment descends one native-Map level, and a
 * value lives on the node reached by the full path.
 *
 * Why a trie and not a stringified key: lookup stays content-addressed without
 * ever building a string — no separator can collide (`["a|b","c"]` vs
 * `["a","b|c"]`) and each segment keeps its own type (`1` ≠ `"1"`). Each level
 * is a native `Map`, so a single-segment lookup is one `Map.get`; an N-segment
 * lookup is N hops — O(arity), effectively O(1) for a fixed arity.
 *
 * A node carries a value ONLY if some path terminates exactly there
 * (`hasValue`), so paths of different lengths coexist: `[a, b]` and `[a, b, c]`
 * never conflict. Empty branches are pruned bottom-up on `delete`, so a churning
 * key space does not leak nodes.
 */
interface TOIMTrieNode<TSegment, TValue> {
    children?: Map<TSegment, TOIMTrieNode<TSegment, TValue>>;
    value?: TValue;
    /** Distinguishes "a value of `undefined` lives here" from "no value here". */
    hasValue: boolean;
}

export class OIMTrieMap<TSegment, TValue> {
    private readonly root: TOIMTrieNode<TSegment, TValue> = { hasValue: false };
    private _size = 0;

    /** Number of stored paths (terminal nodes), not the number of trie nodes. */
    public get size(): number {
        return this._size;
    }

    public set(path: readonly TSegment[], value: TValue): void {
        let node = this.root;
        for (let i = 0; i < path.length; i++) {
            let children = node.children;
            if (!children) {
                children = new Map();
                node.children = children;
            }
            let next = children.get(path[i]);
            if (!next) {
                next = { hasValue: false };
                children.set(path[i], next);
            }
            node = next;
        }
        if (!node.hasValue) {
            node.hasValue = true;
            this._size++;
        }
        node.value = value;
    }

    public get(path: readonly TSegment[]): TValue | undefined {
        const node = this.findNode(path);
        return node && node.hasValue ? node.value : undefined;
    }

    public has(path: readonly TSegment[]): boolean {
        const node = this.findNode(path);
        return !!node && node.hasValue;
    }

    public delete(path: readonly TSegment[]): boolean {
        // Record the parent chain so empty branches can be pruned bottom-up.
        const parents: TOIMTrieNode<TSegment, TValue>[] = [];
        let node = this.root;
        for (let i = 0; i < path.length; i++) {
            const next = node.children?.get(path[i]);
            if (!next) return false;
            parents.push(node);
            node = next;
        }
        if (!node.hasValue) return false;
        node.hasValue = false;
        node.value = undefined;
        this._size--;

        // Prune from the leaf up: drop any node that now holds neither a value
        // nor children.
        let child = node;
        for (let i = parents.length - 1; i >= 0; i--) {
            if (child.hasValue || (child.children && child.children.size > 0)) {
                break;
            }
            const parent = parents[i];
            parent.children!.delete(path[i]);
            if (parent.children!.size === 0) parent.children = undefined;
            child = parent;
        }
        return true;
    }

    public clear(): void {
        this.root.children = undefined;
        this.root.value = undefined;
        this.root.hasValue = false;
        this._size = 0;
    }

    /** Depth-first iteration over `[path, value]` for every stored path. */
    public *entries(): IterableIterator<[TSegment[], TValue]> {
        const stack: { node: TOIMTrieNode<TSegment, TValue>; path: TSegment[] }[] =
            [{ node: this.root, path: [] }];
        while (stack.length > 0) {
            const frame = stack.pop()!;
            const { node, path } = frame;
            if (node.hasValue) {
                yield [path, node.value as TValue];
            }
            if (node.children) {
                for (const [segment, child] of node.children) {
                    stack.push({ node: child, path: [...path, segment] });
                }
            }
        }
    }

    public *keys(): IterableIterator<TSegment[]> {
        for (const [path] of this.entries()) yield path;
    }

    public *values(): IterableIterator<TValue> {
        for (const [, value] of this.entries()) yield value;
    }

    private findNode(
        path: readonly TSegment[]
    ): TOIMTrieNode<TSegment, TValue> | undefined {
        let node: TOIMTrieNode<TSegment, TValue> | undefined = this.root;
        for (let i = 0; i < path.length; i++) {
            node = node.children?.get(path[i]);
            if (!node) return undefined;
        }
        return node;
    }
}
