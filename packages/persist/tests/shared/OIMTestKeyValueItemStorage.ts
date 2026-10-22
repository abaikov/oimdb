import type { IOIMPersistKeyValueStorage, TOIMPersistKeyValueItemStorage } from '../../src';

export class OIMTestKeyValueItemStorage implements IOIMPersistKeyValueStorage, TOIMPersistKeyValueItemStorage {
    public readonly itemByStorageKey = new Map<string, string>();
    public readonly writtenItemsByCommit: ReadonlyMap<string, string>[] = [];

    public readItems(storageKeys: readonly string[]): Promise<ReadonlyMap<string, string>> {
        const itemByStorageKey = new Map<string, string>();
        for (const storageKey of storageKeys) {
            const item = this.itemByStorageKey.get(storageKey);
            if (item !== undefined) itemByStorageKey.set(storageKey, item);
        }
        return Promise.resolve(itemByStorageKey);
    }

    public writeItems(itemByStorageKey: ReadonlyMap<string, string>): Promise<void> {
        this.writtenItemsByCommit.push(new Map(itemByStorageKey));
        for (const [storageKey, item] of itemByStorageKey) this.itemByStorageKey.set(storageKey, item);
        return Promise.resolve();
    }

    public removeItems(storageKeys: readonly string[]): Promise<void> {
        for (const storageKey of storageKeys) this.itemByStorageKey.delete(storageKey);
        return Promise.resolve();
    }

    public getItem(storageKey: string): string | null {
        return this.itemByStorageKey.get(storageKey) ?? null;
    }

    public setItem(storageKey: string, item: string): void {
        this.itemByStorageKey.set(storageKey, item);
    }

    public removeItem(storageKey: string): void {
        this.itemByStorageKey.delete(storageKey);
    }
}
