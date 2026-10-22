import type { IOIMPersistKeyValueStorage } from './interfaces/IOIMPersistKeyValueStorage';
import type { TOIMPersistKeyValueItemStorage } from './types/TOIMPersistKeyValueItemStorage';
import type { TOIMPersistKeyValueStorageItemDrivenOptions } from './types/TOIMPersistKeyValueStorageItemDrivenOptions';

export class OIMPersistKeyValueStorageItemDriven implements IOIMPersistKeyValueStorage {
    private readonly persistKeyValueItemStorage: TOIMPersistKeyValueItemStorage;

    public constructor(persistKeyValueStorageItemDrivenOptions: TOIMPersistKeyValueStorageItemDrivenOptions) {
        this.persistKeyValueItemStorage = persistKeyValueStorageItemDrivenOptions.persistKeyValueItemStorage;
    }

    public async readItems(storageKeys: readonly string[]): Promise<ReadonlyMap<string, string>> {
        const itemByStorageKey = new Map<string, string>();
        for (let i = 0; i < storageKeys.length; i++) {
            const item = await this.persistKeyValueItemStorage.getItem(storageKeys[i]);
            if (item !== null) itemByStorageKey.set(storageKeys[i], item);
        }
        return itemByStorageKey;
    }

    public async writeItems(itemByStorageKey: ReadonlyMap<string, string>): Promise<void> {
        for (const [storageKey, item] of itemByStorageKey) await this.persistKeyValueItemStorage.setItem(storageKey, item);
    }

    public async removeItems(storageKeys: readonly string[]): Promise<void> {
        for (let i = 0; i < storageKeys.length; i++) await this.persistKeyValueItemStorage.removeItem(storageKeys[i]);
    }
}
