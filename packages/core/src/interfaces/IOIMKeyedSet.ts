/**
 * The Set surface the PK / index-key axis needs, abstracted so the concrete
 * keying strategy is pluggable. A native `Set` satisfies this interface
 * structurally (primitive default is a plain `Set`, zero wrapper); a composite
 * key uses a trie-backed implementation matching array keys by content.
 */
export interface IOIMKeyedSet<TKey> {
    add(key: TKey): void;
    has(key: TKey): boolean;
    delete(key: TKey): boolean;
    readonly size: number;
    values(): IterableIterator<TKey>;
    clear(): void;
}
