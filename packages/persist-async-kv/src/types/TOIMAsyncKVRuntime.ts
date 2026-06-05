import { TOIMAsyncKVLike } from './TOIMAsyncKVLike';

/**
 * Resolved runtime passed to the engine as the persistor `storage`.
 *
 * Bundles the underlying async key-value storage with the serialization codec
 * used to turn snapshots into strings and back.
 */
export type TOIMAsyncKVRuntime = {
    storage: TOIMAsyncKVLike;
    serialize(value: unknown): string;
    deserialize(value: string): unknown;
};
