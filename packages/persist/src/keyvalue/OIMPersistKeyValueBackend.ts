import type { IOIMPersistBackend } from '../persistor/interfaces/IOIMPersistBackend';
import { OIM_PERSIST_KEY_VALUE_JSON_SERIALIZER } from './constants/OIM_PERSIST_KEY_VALUE_JSON_SERIALIZER';
import type { IOIMPersistKeyValueStorage } from './interfaces/IOIMPersistKeyValueStorage';
import { OIMPersistKeyValueWriteBatch } from './OIMPersistKeyValueWriteBatch';
import type { TOIMPersistKeyValueBackendOptions } from './types/TOIMPersistKeyValueBackendOptions';
import type { TOIMPersistKeyValueSerializer } from './types/TOIMPersistKeyValueSerializer';

export class OIMPersistKeyValueBackend implements IOIMPersistBackend<OIMPersistKeyValueWriteBatch> {
    private readonly persistKeyValueStorage: IOIMPersistKeyValueStorage;
    private readonly persistKeyValueSerializer: TOIMPersistKeyValueSerializer;

    public constructor(persistKeyValueBackendOptions: TOIMPersistKeyValueBackendOptions) {
        this.persistKeyValueStorage = persistKeyValueBackendOptions.persistKeyValueStorage;
        this.persistKeyValueSerializer = persistKeyValueBackendOptions.persistKeyValueSerializer
            ?? OIM_PERSIST_KEY_VALUE_JSON_SERIALIZER;
    }

    public async readValue(storageKey: string): Promise<unknown> {
        const itemByStorageKey = await this.persistKeyValueStorage.readItems([storageKey]);
        const item = itemByStorageKey.get(storageKey);
        return item === undefined ? undefined : this.persistKeyValueSerializer.deserialize(item);
    }

    public createWriteBatch(): OIMPersistKeyValueWriteBatch {
        return new OIMPersistKeyValueWriteBatch({
            persistKeyValueStorage: this.persistKeyValueStorage,
            persistKeyValueSerializer: this.persistKeyValueSerializer,
        });
    }
}
