/**
 * The Map surface the PK / index-key axis needs, abstracted so the concrete
 * keying strategy is pluggable. A native `Map` satisfies this interface
 * structurally (so the primitive default is a plain `Map`, zero wrapper), while
 * a composite key uses a trie-backed implementation (`OIMTrieMap`) that matches
 * array keys by content instead of by reference.
 */
export interface IOIMKeyedMap<TKey, TValue> {
    get(key: TKey): TValue | undefined;
    set(key: TKey, value: TValue): void;
    has(key: TKey): boolean;
    delete(key: TKey): boolean;
    readonly size: number;
    keys(): IterableIterator<TKey>;
    entries(): IterableIterator<[TKey, TValue]>;
    values(): IterableIterator<TValue>;
    clear(): void;
}
