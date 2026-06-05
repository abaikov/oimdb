export function transactionToPromise(
    db: IDBDatabase,
    tableNames: readonly string[],
    run: (stores: Record<string, IDBObjectStore>) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(tableNames as string[], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        const stores: Record<string, IDBObjectStore> = {};
        for (const name of tableNames) {
            stores[name] = transaction.objectStore(name);
        }
        run(stores);
    });
}
