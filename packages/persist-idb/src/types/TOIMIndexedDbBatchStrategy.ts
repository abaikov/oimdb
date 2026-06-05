import { TOIMPersistStrategy } from '@oimdb/persist';
import type { OIMIndexedDbPersistor } from '../core/OIMIndexedDbPersistor';

/**
 * Extended strategy interface required for atomic batch writes. All built-in
 * IndexedDB strategies implement this. Custom strategies passed to `.using()`
 * fall back to sequential individual writes.
 */
export type TOIMIndexedDbBatchStrategy<TSnapshot> = TOIMPersistStrategy<
    OIMIndexedDbPersistor,
    TSnapshot
> & {
    readonly tableNames: readonly string[];
    writeInTx(
        stores: Record<string, IDBObjectStore>,
        snapshot: TSnapshot
    ): void;
    clearInTx(stores: Record<string, IDBObjectStore>): void;
};
