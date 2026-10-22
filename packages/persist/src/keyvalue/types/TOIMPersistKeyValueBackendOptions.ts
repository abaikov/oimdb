import type { IOIMPersistKeyValueStorage } from '../interfaces/IOIMPersistKeyValueStorage';
import type { TOIMPersistKeyValueSerializer } from './TOIMPersistKeyValueSerializer';

export type TOIMPersistKeyValueBackendOptions = {
    readonly persistKeyValueStorage: IOIMPersistKeyValueStorage;
    readonly persistKeyValueSerializer?: TOIMPersistKeyValueSerializer | undefined;
};
