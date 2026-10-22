import type { TOIMPersistIndexedDbTableRecord } from '../types/TOIMPersistIndexedDbTableRecord';

export function oimReadAllIndexedDbTableRecords(
    database: IDBDatabase, tableName: string,
): Promise<TOIMPersistIndexedDbTableRecord[]> {
    return new Promise((resolve, reject) => {
        const persistIndexedDbTableRecords: TOIMPersistIndexedDbTableRecord[] = [];
        const request = database.transaction(tableName, 'readonly').objectStore(tableName).openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor === null) {
                resolve(persistIndexedDbTableRecords);
                return;
            }
            persistIndexedDbTableRecords.push({ key: cursor.primaryKey, value: cursor.value as unknown });
            cursor.continue();
        };
    });
}
