import { TOIMPersistorOptions } from '@oimdb/persist';
import { TOIMLocalStorageLike } from './TOIMLocalStorageLike';
import { TOIMLocalStorageRuntime } from './TOIMLocalStorageRuntime';

export type TOIMLocalStoragePersistorOptions = Omit<
    TOIMPersistorOptions<TOIMLocalStorageRuntime>,
    'storage'
> & {
    storage?: TOIMLocalStorageLike;
    serialize?: (value: unknown) => string;
    deserialize?: (value: string) => unknown;
};
