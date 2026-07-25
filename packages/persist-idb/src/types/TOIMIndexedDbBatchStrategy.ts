import { TOIMPersistDelta, TOIMPersistStrategy } from '@oimdb/persist';
import type { OIMIndexedDbPersistor } from '../core/OIMIndexedDbPersistor';

/**
 * Extended strategy interface required for atomic batch writes. All built-in
 * IndexedDB strategies implement this. Custom strategies passed to `.using()`
 * fall back to sequential individual writes.
 *
 * `writeDeltaInTx` is optional: strategies that store one record per key (e.g.
 * the `records` strategy) implement it so a single-key change writes a single
 * record inside the shared transaction instead of clearing and rewriting the
 * whole table. Whole-blob strategies (`entry`) omit it and always rewrite.
 */
export type TOIMIndexedDbBatchStrategy<
    TSnapshot,
    TKey = unknown,
    TValue = unknown,
> = TOIMPersistStrategy<OIMIndexedDbPersistor, TSnapshot, TKey, TValue> & {
    readonly tableNames: readonly string[];
    writeInTx(
        stores: Record<string, IDBObjectStore>,
        snapshot: TSnapshot
    ): void;
    clearInTx(stores: Record<string, IDBObjectStore>): void;
    writeDeltaInTx?(
        stores: Record<string, IDBObjectStore>,
        delta: TOIMPersistDelta<TKey, TValue>
    ): void;
};
