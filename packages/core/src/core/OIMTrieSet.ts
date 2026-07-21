import { TOIMKeyPath } from '../types/TOIMKeyPath';
import { TOIMPk } from '../types/TOIMPk';
import { IOIMKeyedSet } from '../interfaces/IOIMKeyedSet';
import { OIMTrieMap } from './OIMTrieMap';

/**
 * Trie-backed Set of composite key paths — the `Set` counterpart of
 * `OIMTrieMap`. Membership is by content, so a freshly built `[a, b]` is the
 * same member as one added earlier. Implemented over an `OIMTrieMap<TOIMPk,
 * true>` to reuse its terminal-flagged nodes and empty-branch pruning.
 */
export class OIMTrieSet implements IOIMKeyedSet<TOIMKeyPath> {
    private readonly map = new OIMTrieMap<TOIMPk, true>();

    public get size(): number {
        return this.map.size;
    }

    public add(key: TOIMKeyPath): void {
        this.map.set(key, true);
    }

    public has(key: TOIMKeyPath): boolean {
        return this.map.has(key);
    }

    public delete(key: TOIMKeyPath): boolean {
        return this.map.delete(key);
    }

    public *values(): IterableIterator<TOIMKeyPath> {
        yield* this.map.keys();
    }

    public clear(): void {
        this.map.clear();
    }
}
