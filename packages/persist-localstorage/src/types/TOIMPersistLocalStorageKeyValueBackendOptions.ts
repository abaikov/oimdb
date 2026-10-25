import type { TOIMPersistKeyValueItemStorage, TOIMPersistKeyValueSerializer } from '@oimdb/persist';

export type TOIMPersistLocalStorageKeyValueBackendOptions = {
    readonly persistKeyValueItemStorage?: TOIMPersistKeyValueItemStorage | undefined;
    readonly persistKeyValueSerializer?: TOIMPersistKeyValueSerializer | undefined;
};
