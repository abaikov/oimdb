export type TOIMPersistKeyValueItemStorage = {
    getItem(storageKey: string): Promise<string | null> | string | null;
    setItem(storageKey: string, item: string): Promise<void> | void;
    removeItem(storageKey: string): Promise<void> | void;
};
