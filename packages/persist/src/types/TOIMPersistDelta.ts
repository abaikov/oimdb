/**
 * A per-key change set for a keyed source (e.g. a collection keyed by PK).
 *
 * Produced by a source adapter's keyed capability from the set of keys that
 * changed within one flush, and consumed by a strategy's `writeDelta`. It lets
 * a per-key backend (IndexedDB table, KV store) write only what changed instead
 * of re-serializing and rewriting the whole collection.
 *
 * `upserts` carries the current value of every changed-and-still-present key;
 * `deletedKeys` carries the changed keys that no longer exist in the source.
 */
export type TOIMPersistDelta<TKey, TValue> = {
    upserts: ReadonlyArray<{ key: TKey; value: TValue }>;
    deletedKeys: readonly TKey[];
};
