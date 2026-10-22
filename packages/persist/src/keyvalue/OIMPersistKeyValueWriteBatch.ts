import type { IOIMPersistWriteBatch } from '../persistor/interfaces/IOIMPersistWriteBatch';
import { OIMPersistWriteBatchChanges } from '../persistor/OIMPersistWriteBatchChanges';
import type { IOIMPersistKeyValueStorage } from './interfaces/IOIMPersistKeyValueStorage';
import type { TOIMPersistKeyValueSerializer } from './types/TOIMPersistKeyValueSerializer';
import type { TOIMPersistKeyValueStorageKeyChange } from './types/TOIMPersistKeyValueStorageKeyChange';
import type { TOIMPersistKeyValueWriteBatchOptions } from './types/TOIMPersistKeyValueWriteBatchOptions';
import { oimDeletePath } from './utils/oimDeletePath';
import { oimSetPath } from './utils/oimSetPath';

const oimIsRoot = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';

const createStorageKeyChange = (isRemoved: boolean, hasWrittenValue: boolean, writtenValue: unknown): TOIMPersistKeyValueStorageKeyChange => ({
    isRemoved,
    hasWrittenValue,
    writtenValue,
    hasPathWrites: false,
    rootChanges: new OIMPersistWriteBatchChanges<Record<string, unknown>>(),
});

export class OIMPersistKeyValueWriteBatch implements IOIMPersistWriteBatch {
    private readonly persistKeyValueStorage: IOIMPersistKeyValueStorage;
    private readonly persistKeyValueSerializer: TOIMPersistKeyValueSerializer;
    private readonly storageKeyChangeByStorageKey = new Map<string, TOIMPersistKeyValueStorageKeyChange>();

    public constructor(persistKeyValueWriteBatchOptions: TOIMPersistKeyValueWriteBatchOptions) {
        this.persistKeyValueStorage = persistKeyValueWriteBatchOptions.persistKeyValueStorage;
        this.persistKeyValueSerializer = persistKeyValueWriteBatchOptions.persistKeyValueSerializer;
    }

    public writeValue(storageKey: string, value: unknown): void {
        this.storageKeyChangeByStorageKey.set(storageKey, createStorageKeyChange(false, true, value));
    }

    public removeValue(storageKey: string): void {
        this.storageKeyChangeByStorageKey.set(storageKey, createStorageKeyChange(true, false, undefined));
    }

    public writeValueAtPath(storageKey: string, path: readonly string[], value: unknown): void {
        const storageKeyChange = this.getStorageKeyChange(storageKey);
        if (storageKeyChange.isRemoved) {
            storageKeyChange.isRemoved = false;
            storageKeyChange.hasWrittenValue = true;
            storageKeyChange.writtenValue = {};
        }
        storageKeyChange.hasPathWrites = true;
        storageKeyChange.rootChanges.addWriteBatchChange(root => { oimSetPath(root, path, this.copyValue(value)); });
    }

    public deleteValueAtPath(storageKey: string, path: readonly string[]): void {
        const storageKeyChange = this.getStorageKeyChange(storageKey);
        if (storageKeyChange.isRemoved) return;
        storageKeyChange.rootChanges.addWriteBatchChange(root => { oimDeletePath(root, path); });
    }

    public async commit(): Promise<void> {
        const persistKeyValueSerializer = this.persistKeyValueSerializer;
        const storageKeyChangeByStorageKey = this.storageKeyChangeByStorageKey;
        const storageKeysToRead: string[] = [];
        for (const [storageKey, storageKeyChange] of storageKeyChangeByStorageKey) {
            if (storageKeyChange.rootChanges.hasWriteBatchChanges && !storageKeyChange.hasWrittenValue) {
                storageKeysToRead.push(storageKey);
            }
        }
        const storedItemByStorageKey = storageKeysToRead.length === 0
            ? new Map<string, string>()
            : await this.persistKeyValueStorage.readItems(storageKeysToRead);
        const itemByStorageKey = new Map<string, string>();
        const removedStorageKeys: string[] = [];
        for (const [storageKey, storageKeyChange] of storageKeyChangeByStorageKey) {
            if (storageKeyChange.isRemoved) {
                removedStorageKeys.push(storageKey);
                continue;
            }
            if (storageKeyChange.rootChanges.hasWriteBatchChanges) this.applyRootChanges(storageKeyChange, storedItemByStorageKey.get(storageKey));
            if (storageKeyChange.hasWrittenValue) {
                itemByStorageKey.set(storageKey, persistKeyValueSerializer.serialize(storageKeyChange.writtenValue));
            }
        }
        if (itemByStorageKey.size !== 0) await this.persistKeyValueStorage.writeItems(itemByStorageKey);
        if (removedStorageKeys.length !== 0) await this.persistKeyValueStorage.removeItems(removedStorageKeys);
    }

    private applyRootChanges(storageKeyChange: TOIMPersistKeyValueStorageKeyChange, storedItem: string | undefined): void {
        const currentValue = storageKeyChange.hasWrittenValue
            ? storageKeyChange.writtenValue
            : storedItem === undefined ? undefined : this.persistKeyValueSerializer.deserialize(storedItem);
        if (!oimIsRoot(currentValue) && !storageKeyChange.hasPathWrites) return;
        const root = !oimIsRoot(currentValue)
            ? {}
            : storageKeyChange.hasWrittenValue ? this.copyValue(currentValue) as Record<string, unknown> : currentValue;
        storageKeyChange.rootChanges.applyWriteBatchChanges(root);
        storageKeyChange.hasWrittenValue = true;
        storageKeyChange.writtenValue = root;
    }

    private getStorageKeyChange(storageKey: string): TOIMPersistKeyValueStorageKeyChange {
        const storageKeyChangeByStorageKey = this.storageKeyChangeByStorageKey;
        const storedStorageKeyChange = storageKeyChangeByStorageKey.get(storageKey);
        if (storedStorageKeyChange !== undefined) return storedStorageKeyChange;
        const storageKeyChange = createStorageKeyChange(false, false, undefined);
        storageKeyChangeByStorageKey.set(storageKey, storageKeyChange);
        return storageKeyChange;
    }

    private copyValue(value: unknown): unknown {
        if (value === null || typeof value !== 'object') return value;
        const persistKeyValueSerializer = this.persistKeyValueSerializer;
        return persistKeyValueSerializer.deserialize(persistKeyValueSerializer.serialize(value));
    }
}
