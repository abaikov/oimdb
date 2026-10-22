import type { TOIMPersistIndexedDbOpenWithTablesOptions } from '../types/TOIMPersistIndexedDbOpenWithTablesOptions';
import { oimOpenIndexedDb } from './oimOpenIndexedDb';

const OIM_MAX_OPEN_ATTEMPTS = 5;

export async function oimOpenIndexedDbWithTables(
    persistIndexedDbOpenWithTablesOptions: TOIMPersistIndexedDbOpenWithTablesOptions,
): Promise<IDBDatabase> {
    const { persistIndexedDbOpenOptions, tableNames } = persistIndexedDbOpenWithTablesOptions;
    const { indexedDb, databaseName } = persistIndexedDbOpenOptions;
    let database = await oimOpenIndexedDb({ indexedDb, databaseName });
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
            database = await oimOpenIndexedDb({
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
            database = await oimOpenIndexedDb({ indexedDb, databaseName });
        }
    }
}
