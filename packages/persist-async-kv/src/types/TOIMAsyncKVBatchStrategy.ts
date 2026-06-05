import { TOIMPersistStrategy } from '@oimdb/persist';
import type { OIMAsyncKVPersistor } from '../core/OIMAsyncKVPersistor';

/**
 * Extended strategy interface for atomic batch writes. All built-in async KV
 * strategies implement this. Custom strategies via `.using()` fall back to
 * sequential writes.
 */
export type TOIMAsyncKVBatchStrategy<TSnapshot> = TOIMPersistStrategy<
    OIMAsyncKVPersistor,
    TSnapshot
> & {
    readonly storageKeys: readonly string[];
    writeToRoots(
        roots: Map<string, unknown>,
        toDelete: Set<string>,
        snapshot: TSnapshot
    ): void;
    clearFromRoots(roots: Map<string, unknown>, toDelete: Set<string>): void;
};
