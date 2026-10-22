import type { TOIMPersistRecord } from '@oimdb/persist';

export type TOIMPersistJsonDump = {
    readonly snapshotValues: Readonly<Record<string, unknown>>;
    readonly recordsByStorageKey: Readonly<Record<string, readonly TOIMPersistRecord<unknown, unknown>[]>>;
};
