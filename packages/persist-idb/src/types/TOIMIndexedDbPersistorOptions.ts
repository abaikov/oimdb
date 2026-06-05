import { TOIMPersistorOptions } from '@oimdb/persist';
import { TOIMIndexedDbRuntime } from './TOIMIndexedDbRuntime';

export type TOIMIndexedDbPersistorOptions = Omit<
    TOIMPersistorOptions<TOIMIndexedDbRuntime>,
    'storage'
> & {
    databaseName: string;
    databaseVersion?: number;
    indexedDb?: IDBFactory;
};
