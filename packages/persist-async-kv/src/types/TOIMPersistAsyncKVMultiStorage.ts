export type TOIMPersistAsyncKVMultiStorage = {
    multiGet(storageKeys: string[]): Promise<ReadonlyArray<readonly [string, string | null]>>;
    multiSet(itemEntries: Array<[string, string]>): Promise<void>;
    multiRemove(storageKeys: string[]): Promise<void>;
};
