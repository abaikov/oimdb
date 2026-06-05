import { TOIMLocalStorageLike } from './TOIMLocalStorageLike';

/**
 * Resolved runtime passed to the engine as the persistor `storage`.
 *
 * Bundles the underlying Web Storage with the serialization codec used to turn
 * snapshots into strings and back.
 */
export type TOIMLocalStorageRuntime = {
    storage: TOIMLocalStorageLike;
    serialize(value: unknown): string;
    deserialize(value: string): unknown;
};
