import { openDatabase } from './openDatabase';

export async function openDatabaseWithTables(
    options: {
        databaseName: string;
        databaseVersion?: number;
        indexedDb: IDBFactory;
    },
    tableNames: readonly string[]
): Promise<IDBDatabase> {
    const db = await openDatabase(options.indexedDb, options.databaseName);
    const missing = tableNames.filter(t => !db.objectStoreNames.contains(t));
    if (missing.length === 0) return db;

    const nextVersion = Math.max(options.databaseVersion ?? 1, db.version + 1);
    db.close();
    return openDatabase(
        options.indexedDb,
        options.databaseName,
        nextVersion,
        database => {
            for (const t of missing) {
                if (!database.objectStoreNames.contains(t)) {
                    database.createObjectStore(t);
                }
            }
        }
    );
}
