import type { IOIMPersistKeyValueStorage } from '@oimdb/persist';
import type { TOIMPersistAsyncKVStorageOptions } from './types/TOIMPersistAsyncKVStorageOptions';
import type { TOIMPersistAsyncKVMultiStorage } from './types/TOIMPersistAsyncKVMultiStorage';

export class OIMPersistAsyncKVStorage implements IOIMPersistKeyValueStorage {
    private readonly persistAsyncKVMultiStorage: TOIMPersistAsyncKVMultiStorage;

    public constructor(persistAsyncKVStorageOptions: TOIMPersistAsyncKVStorageOptions) {
        this.persistAsyncKVMultiStorage = persistAsyncKVStorageOptions.persistAsyncKVMultiStorage;
    }

    public async readItems(storageKeys: readonly string[]): Promise<ReadonlyMap<string, string>> {
        const itemByStorageKey = new Map<string, string>();
        const itemEntries = await this.persistAsyncKVMultiStorage.multiGet(storageKeys.slice());
        for (const [storageKey, item] of itemEntries) {
            if (item !== null) itemByStorageKey.set(storageKey, item);
        }
        return itemByStorageKey;
    }

    public async writeItems(itemByStorageKey: ReadonlyMap<string, string>): Promise<void> {
        await this.persistAsyncKVMultiStorage.multiSet(Array.from(itemByStorageKey));
    }

    public async removeItems(storageKeys: readonly string[]): Promise<void> {
        await this.persistAsyncKVMultiStorage.multiRemove(storageKeys.slice());
    }
}
