import { TOIMPersistStrategy } from '@oimdb/persist';
import type { OIMLocalStoragePersistor } from '../core/OIMLocalStoragePersistor';

/**
 * Extended strategy interface for atomic batch writes. All built-in localStorage
 * strategies implement this. Custom strategies via `.using()` fall back to
 * sequential writes.
 */
export type TOIMLocalStorageBatchStrategy<TSnapshot> = TOIMPersistStrategy<
    OIMLocalStoragePersistor,
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
