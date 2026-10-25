import { OIMPersistKeyValueBackend, OIMPersistItemKeyValueStorage } from '@oimdb/persist';
import type { TOIMPersistKeyValueItemStorage } from '@oimdb/persist';
import type { TOIMPersistLocalStorageKeyValueBackendOptions } from './types/TOIMPersistLocalStorageKeyValueBackendOptions';

const oimReadGlobalLocalStorage = (): TOIMPersistKeyValueItemStorage => {
    const persistKeyValueItemStorage = (globalThis as { localStorage?: TOIMPersistKeyValueItemStorage }).localStorage;
    if (persistKeyValueItemStorage === undefined) {
        throw new Error(
            'OIMPersistLocalStorageKeyValueBackend: globalThis.localStorage is not available in this environment. '
            + 'Pass persistKeyValueItemStorage, for example an in-memory object with getItem, setItem and removeItem.',
        );
    }
    return persistKeyValueItemStorage;
};

export class OIMPersistLocalStorageKeyValueBackend extends OIMPersistKeyValueBackend {
    public constructor(persistLocalStorageKeyValueBackendOptions: TOIMPersistLocalStorageKeyValueBackendOptions = {}) {
        super({
            persistKeyValueStorage: new OIMPersistItemKeyValueStorage({
                persistKeyValueItemStorage: persistLocalStorageKeyValueBackendOptions.persistKeyValueItemStorage
                    ?? oimReadGlobalLocalStorage(),
            }),
            persistKeyValueSerializer: persistLocalStorageKeyValueBackendOptions.persistKeyValueSerializer,
        });
    }
}
