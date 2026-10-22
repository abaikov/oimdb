/** `updated` means present in both with a different value REFERENCE. */
export type TOIMReduxEntityKeysDiff<TKey extends PropertyKey> = {
    added: Set<TKey>;
    updated: Set<TKey>;
    removed: Set<TKey>;
    all: Set<TKey>;
};
