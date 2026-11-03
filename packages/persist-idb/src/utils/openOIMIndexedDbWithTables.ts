import type { TOIMPersistIndexedDbOpenWithTablesOptions } from '../types/TOIMPersistIndexedDbOpenWithTablesOptions';
import { openOIMIndexedDb } from './openOIMIndexedDb';

const OIM_MAX_OPEN_ATTEMPTS = 5;

export async function openOIMIndexedDbWithTables(
    persistIndexedDbOpenWithTablesOptions: TOIMPersistIndexedDbOpenWithTablesOptions,
): Promise<IDBDatabase> {
    const { persistIndexedDbOpenOptions, tableNames } = persistIndexedDbOpenWithTablesOptions;
    const { indexedDb, databaseName } = persistIndexedDbOpenOptions;
    let database = await openOIMIndexedDb({ indexedDb, databaseName });
    for (let attempt = 1; ; attempt++) {
        const missingTableNames = tableNames.filter(tableName => !database.objectStoreNames.contains(tableName));
        if (missingTableNames.length === 0) return database;
        if (attempt > OIM_MAX_OPEN_ATTEMPTS) {
            database.close();
            throw new Error(
                `[OIMPersist]: could not create object store(s) ${missingTableNames.join(', ')} in IndexedDB database `
                + `"${databaseName}": another connection upgraded it first on every attempt.`,
            );
        }
        const databaseVersion = Math.max(persistIndexedDbOpenOptions.databaseVersion ?? 1, database.version + 1);
        database.close();
        try {
            database = await openOIMIndexedDb({
                indexedDb,
                databaseName,
                databaseVersion,
                onUpgradeNeeded: upgradingDatabase => {
                    for (const tableName of missingTableNames) {
                        if (!upgradingDatabase.objectStoreNames.contains(tableName)) upgradingDatabase.createObjectStore(tableName);
                    }
                },
            });
        } catch (error) {
            if (attempt >= OIM_MAX_OPEN_ATTEMPTS) throw error;
            database = await openOIMIndexedDb({ indexedDb, databaseName });
        }
    }
}
