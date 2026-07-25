import { TOIMPersistDelta } from './TOIMPersistDelta';

export type TOIMPersistStrategy<
    TPersistor,
    TSnapshot,
    TKey = unknown,
    TValue = unknown,
> = {
    read(persistor: TPersistor): Promise<TSnapshot | undefined>;
    write(persistor: TPersistor, snapshot: TSnapshot): Promise<void>;
    clear(persistor: TPersistor): Promise<void>;
    /**
     * Optional per-key write. When a strategy implements this AND its source is
     * key-aware, the engine hands it only the keys that changed in a flush
     * rather than the full snapshot — so a single-key change writes a single
     * record instead of rewriting the whole collection.
     *
     * Omit it when the backend can only rewrite everything (a single blob / one
     * storage key): the engine then always uses `write` with the full snapshot.
     * A strategy that implements `writeDelta` owns its per-key storage format,
     * so the resource-level whole-snapshot `codec` is NOT applied on this path —
     * `write`/`read` and `writeDelta` must agree on how values are stored.
     */
    writeDelta?(
        persistor: TPersistor,
        delta: TOIMPersistDelta<TKey, TValue>
    ): Promise<void>;
};
