import { TOIMPersistorOptions } from '@oimdb/persist';
import { TOIMAsyncKVLike } from './TOIMAsyncKVLike';
import { TOIMAsyncKVRuntime } from './TOIMAsyncKVRuntime';

export type TOIMAsyncKVPersistorOptions = Omit<
    TOIMPersistorOptions<TOIMAsyncKVRuntime>,
    'storage'
> & {
    storage: TOIMAsyncKVLike;
    serialize?: (value: unknown) => string;
    deserialize?: (value: string) => unknown;
};
