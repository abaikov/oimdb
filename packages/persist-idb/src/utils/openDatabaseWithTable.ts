import { openDatabaseWithTables } from './openDatabaseWithTables';

export async function openDatabaseWithTable(
    options: {
        databaseName: string;
        databaseVersion?: number;
        indexedDb: IDBFactory;
    },
    tableName: string
): Promise<IDBDatabase> {
    return openDatabaseWithTables(options, [tableName]);
}
