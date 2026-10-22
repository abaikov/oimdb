import type { IOIMPersistKeyValueStorage } from '../interfaces/IOIMPersistKeyValueStorage';
import type { TOIMPersistKeyValueSerializer } from './TOIMPersistKeyValueSerializer';

export type TOIMPersistKeyValueWriteBatchOptions = {
    readonly persistKeyValueStorage: IOIMPersistKeyValueStorage;
    readonly persistKeyValueSerializer: TOIMPersistKeyValueSerializer;
};
