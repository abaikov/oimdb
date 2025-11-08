import { OIMReactiveCollection, TOIMPk } from '@oimdb/core';

/**
 * Extract entity type from OIMReactiveCollection
 */
export type GetEntityType<T> =
    T extends OIMReactiveCollection<infer TEntity, string | number>
        ? TEntity
        : never;

/**
 * Extract primary key type from OIMReactiveCollection
 */
export type GetPkType<T> =
    T extends OIMReactiveCollection<object, infer TPk> ? TPk : never;

/**
 * Individual entity snapshot containing primary key and entity data
 * Entity is null if the entity was deleted
 */
export type EntitySnapshot<TEntity extends object, TPk extends TOIMPk> = {
    pk: TPk;
    entity: TEntity | null;
};

/**
 * Snapshot data for a collection of collections
 * Maps collection names to arrays of entity snapshots
 */
export type SnapshotData<
    TCollections extends Record<
        string,
        OIMReactiveCollection<object, string | number>
    >,
> = {
    [K in keyof TCollections]: Array<
        EntitySnapshot<
            GetEntityType<TCollections[K]>,
            GetPkType<TCollections[K]>
        >
    >;
};

/**
 * Options for snapshot manager configuration
 */
export type SnapshotManagerOptions = {
    /**
     * Whether to include empty collections in snapshot results
     * @default true
     */
    includeEmptyCollections?: boolean;
};
