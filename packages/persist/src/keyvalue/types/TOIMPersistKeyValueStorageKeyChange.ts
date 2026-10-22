import type { OIMPersistWriteBatchChanges } from '../../persistor/OIMPersistWriteBatchChanges';

export type TOIMPersistKeyValueStorageKeyChange = {
    isRemoved: boolean;
    hasWrittenValue: boolean;
    writtenValue: unknown;
    hasPathWrites: boolean;
    readonly rootChanges: OIMPersistWriteBatchChanges<Record<string, unknown>>;
};
