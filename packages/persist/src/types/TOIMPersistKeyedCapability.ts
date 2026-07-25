import { TOIMPersistDelta } from './TOIMPersistDelta';
import { TOIMPersistUnsubscribe } from './TOIMPersistUnsubscribe';

/**
 * Optional capability a source adapter exposes when it can report *which* keys
 * changed and read/apply values at key granularity. Its presence is what makes
 * delta persistence possible; without it a resource always takes the full
 * snapshot.
 *
 * The engine pairs this with a strategy's optional `writeDelta`: only when BOTH
 * exist does a change persist as a delta. A whole-blob strategy that must
 * rewrite everything simply omits `writeDelta`, and the full-snapshot path is
 * used even though the source is key-aware.
 */
export type TOIMPersistKeyedCapability<TKey, TValue> = {
    /**
     * Subscribe to changes reported at key granularity. Fires once per flush
     * with the keys touched during it.
     */
    subscribeKeys(
        onChange: (keys: readonly TKey[]) => void
    ): TOIMPersistUnsubscribe;
    /**
     * Build a delta for the given keys against the source's *current* contents:
     * keys still present become upserts, keys now absent become deletions.
     */
    readDelta(keys: readonly TKey[]): TOIMPersistDelta<TKey, TValue>;
    /** Apply a delta back onto the source (upserts then deletions). */
    applyDelta(delta: TOIMPersistDelta<TKey, TValue>): void;
};
