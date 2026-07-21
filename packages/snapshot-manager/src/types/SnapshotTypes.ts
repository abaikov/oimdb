import {
    EOIMCollectionEventType,
    TOIMCollectionUpdatePayload,
    TOIMEventHandler,
    TOIMKey,
} from '@oimdb/core';

/**
 * Minimal structural contract needed by the snapshot manager.
 * Intentionally does NOT depend on `OIMReactiveCollection<...>` directly to avoid
 * generic invariance issues leaking into snapshot-manager public types.
 */
export type TOIMSnapshotCollection<
    TEntity extends object,
    TPk extends TOIMKey,
> = {
    emitter: {
        on(
            event: EOIMCollectionEventType.UPDATE,
            handler: TOIMEventHandler<TOIMCollectionUpdatePayload<TPk>>
        ): void;
        off(
            event: EOIMCollectionEventType.UPDATE,
            handler: TOIMEventHandler<TOIMCollectionUpdatePayload<TPk>>
        ): void;
    };
    getOneByPk(pk: TPk): TEntity | undefined;
};

/**
 * Extract entity type from snapshot collection
 */
export type GetEntityType<T> =
    T extends TOIMSnapshotCollection<infer TEntity, TOIMKey> ? TEntity : never;

/**
 * Extract primary key type from snapshot collection
 */
export type GetPkType<T> =
    T extends TOIMSnapshotCollection<object, infer TPk extends TOIMKey>
        ? TPk
        : never;

/**
 * Individual entity snapshot containing primary key and entity data
 * Entity is null if the entity was deleted
 */
export type EntitySnapshot<TEntity extends object, TPk extends TOIMKey> = {
    pk: TPk;
    entity: TEntity | null;
};

/**
 * Snapshot data for a collection of collections
 * Maps collection names to arrays of entity snapshots
 */
export type SnapshotData<
    TCollections extends Record<string, TOIMSnapshotCollection<object, TOIMKey>>,
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
