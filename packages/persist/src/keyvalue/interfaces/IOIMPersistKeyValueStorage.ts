export interface IOIMPersistKeyValueStorage {
    readItems(storageKeys: readonly string[]): Promise<ReadonlyMap<string, string>>;
    writeItems(itemByStorageKey: ReadonlyMap<string, string>): Promise<void>;
    removeItems(storageKeys: readonly string[]): Promise<void>;
}
