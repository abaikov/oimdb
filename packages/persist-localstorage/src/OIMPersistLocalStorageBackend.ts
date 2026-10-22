import { OIMPersistKeyValueBackend, OIMPersistKeyValueStorageItemDriven } from '@oimdb/persist';
import type { TOIMPersistKeyValueItemStorage } from '@oimdb/persist';
import type { TOIMPersistLocalStorageBackendOptions } from './types/TOIMPersistLocalStorageBackendOptions';

const oimReadGlobalLocalStorage = (): TOIMPersistKeyValueItemStorage => {
    const persistKeyValueItemStorage = (globalThis as { localStorage?: TOIMPersistKeyValueItemStorage }).localStorage;
    if (persistKeyValueItemStorage === undefined) {
        throw new Error(
            'OIMPersistLocalStorageBackend: globalThis.localStorage is not available in this environment. '
            + 'Pass persistKeyValueItemStorage, for example an in-memory object with getItem, setItem and removeItem.',
        );
    }
    return persistKeyValueItemStorage;
};

export class OIMPersistLocalStorageBackend extends OIMPersistKeyValueBackend {
    public constructor(persistLocalStorageBackendOptions: TOIMPersistLocalStorageBackendOptions = {}) {
        super({
            persistKeyValueStorage: new OIMPersistKeyValueStorageItemDriven({
                persistKeyValueItemStorage: persistLocalStorageBackendOptions.persistKeyValueItemStorage
                    ?? oimReadGlobalLocalStorage(),
            }),
            persistKeyValueSerializer: persistLocalStorageBackendOptions.persistKeyValueSerializer,
        });
    }
}
