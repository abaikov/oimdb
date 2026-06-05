export function readAllRecords(
    db: IDBDatabase,
    tableName: string
): Promise<Array<{ primaryKey: IDBValidKey; value: unknown }>> {
    return new Promise((resolve, reject) => {
        const records: Array<{ primaryKey: IDBValidKey; value: unknown }> = [];
        const request = db
            .transaction(tableName, 'readonly')
            .objectStore(tableName)
            .openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(records);
                return;
            }
            records.push({
                primaryKey: cursor.primaryKey,
                value: cursor.value,
            });
            cursor.continue();
        };
    });
}
