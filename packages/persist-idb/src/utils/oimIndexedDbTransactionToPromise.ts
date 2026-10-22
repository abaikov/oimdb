export function oimIndexedDbTransactionToPromise(
    database: IDBDatabase,
    tableNames: readonly string[],
    writeInTransaction: (objectStoreByTableName: ReadonlyMap<string, IDBObjectStore>) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(tableNames.slice(), 'readwrite');
        let firstError: unknown;
        let hasFailed = false;
        const recordError = (error: unknown): void => {
            if (hasFailed || error === null || error === undefined) return;
            firstError = error;
            hasFailed = true;
        };
        transaction.onerror = event => { recordError((event.target as IDBRequest | null)?.error); };
        transaction.onabort = () => {
            recordError(transaction.error);
            reject(hasFailed ? firstError : new Error('[OIMPersist]: the IndexedDB transaction was aborted.'));
        };
        transaction.oncomplete = () => resolve();
        const objectStoreByTableName = new Map<string, IDBObjectStore>();
        for (const tableName of tableNames) objectStoreByTableName.set(tableName, transaction.objectStore(tableName));
        try {
            writeInTransaction(objectStoreByTableName);
        } catch (error) {
            recordError(error);
            transaction.abort();
        }
    });
}
