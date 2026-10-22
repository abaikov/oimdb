import type { TOIMPersistKeyValueItemStorage, TOIMPersistKeyValueSerializer } from '@oimdb/persist';

export type TOIMPersistLocalStorageBackendOptions = {
    readonly persistKeyValueItemStorage?: TOIMPersistKeyValueItemStorage | undefined;
    readonly persistKeyValueSerializer?: TOIMPersistKeyValueSerializer | undefined;
};
