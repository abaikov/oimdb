import { TOIMPersistorOptions } from '@oimdb/persist';
import { TOIMMemoryPersistStorage } from './TOIMMemoryPersistStorage';

export type TOIMMemoryPersistorOptions = Omit<
    TOIMPersistorOptions<TOIMMemoryPersistStorage>,
    'storage'
> & {
    storage?: TOIMMemoryPersistStorage;
};
