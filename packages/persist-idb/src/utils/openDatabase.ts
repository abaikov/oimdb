export function openDatabase(
    indexedDb: IDBFactory,
    databaseName: string,
    version?: number,
    upgrade?: (db: IDBDatabase) => void
): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDb.open(databaseName, version);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => upgrade?.(request.result);
    });
}
