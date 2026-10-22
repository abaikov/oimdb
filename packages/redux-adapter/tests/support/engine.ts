/**
 * EVERY BUCKET HERE IS UNORDERED, and that is not a shortcut: a `Set` iterates
 * in insertion order, and `write` empties before it joins, so a bucket
 * reads back in the order the caller wrote it — which is what these suites
 * assert. An ordered service decides the order itself, which would be a fact
 * about the sorter rather than about the adapter.
 */
import {
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotStoreServiceMapDriven,
    createOIMBucketService,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMEntityWriterReplacing,
    type IOIMEntityWriter,
    type OIMDB,
} from '@oimdb/core';
import type {
    TOIMBucketSlot,
    TOIMColumnSlot,
    TOIMEntitySlot,
    TOIMStoreKey,
    TOIMSlot,
    TOIMBucketSlotsSetStore,
} from '@oimdb/core';

const createEntityService = <TEntity extends object>(
    db: OIMDB, keyOf: (entity: TEntity) => TOIMStoreKey, entityWriter: IOIMEntityWriter,
) => createOIMEntityService<TEntity>(db, {
    keyOf,
    entityWriter,
    columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
});

const createBucketService = <TEntity extends object>(db: OIMDB) => createOIMBucketService<
    TOIMEntitySlot<TEntity>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TEntity>>,
    OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TEntity>>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TEntity>>() });

export type TEntityService<TEntity extends object> = ReturnType<typeof createEntityService<TEntity>>;

export type TEntityStoreSlot<TEntity extends object> = ReturnType<TEntityService<TEntity>['createStoreSlot']>;

/** A bucket collection over an unordered service — what every fixture builds. */
export type TBucketService<TEntity extends object> = ReturnType<typeof createBucketService<TEntity>>;

export type TBucketStoreSlot<TEntity extends object> = ReturnType<TBucketService<TEntity>['createStoreSlot']>;

/** The write stack that makes a collection deliver. One per collection. */
export const delivering = (): IOIMEntityWriter =>
    createOIMEntityWriterInPlace();

/** A scalar-keyed population that reports into `db`. */
export function entityServiceOf<TEntity extends object>(
    db: OIMDB,
    keyOf: (entity: TEntity) => TOIMStoreKey
): TEntityService<TEntity> {
    return createEntityService<TEntity>(db, keyOf, delivering());
}

/**
 * The same, over the REPLACING write strategy: every change allocates a fresh
 * record, so a consumer that diffs entities by reference sees one.
 * `oimDefaultCollectionMapper`'s state and the linked-index diff both do.
 */
export function replacingEntityServiceOf<TEntity extends object>(
    db: OIMDB,
    keyOf: (entity: TEntity) => TOIMStoreKey
): TEntityService<TEntity> {
    return createEntityService<TEntity>(db, keyOf, createOIMEntityWriterReplacing());
}

/** A scalar-keyed bucket collection whose slots the caller writes. */
export function bucketServiceOf<TEntity extends object>(db: OIMDB): TBucketService<TEntity> {
    return createBucketService<TEntity>(db);
}

export type TGlobalBucket<TEntity extends object> = {
    bucketService: TBucketService<TEntity>;
    bucketStoreSlot: TBucketStoreSlot<TEntity>;
    bucket: TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot<TEntity>>, TOIMStoreKey>;
};

/** The keyless index, built the documented way: one bucket held under a fixed key. */
export function singleBucketOf<TEntity extends object>(db: OIMDB): {
    singleBucket: TGlobalBucket<TEntity>;
    bucketService: TBucketService<TEntity>;
    bucketStoreSlot: TBucketStoreSlot<TEntity>;
    bucket: TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot<TEntity>>, TOIMStoreKey>;
} {
    const bucketService = bucketServiceOf<TEntity>(db);
    const bucketStoreSlot = bucketService.createStoreSlot(db);
    const bucket = bucketService.holdSlotByKey(bucketStoreSlot, 'all');
    return { singleBucket: { bucketService, bucketStoreSlot, bucket }, bucketService, bucketStoreSlot, bucket };
}

/**
 * Write one bucket's slots by resolving row ids through a population.
 *
 * Every resolution is a hold given back AFTER the write, which is the protocol
 * the adapter itself follows: minting by key is the only way to name a row that
 * has no value yet, and the holds `writeBucketMemberSlots` takes are what keep whatever
 * joined.
 */
export function setBucketSlots<TEntity extends object>(
    bucketService: TBucketService<TEntity>,
    bucketStoreSlot: TBucketStoreSlot<TEntity>,
    entityService: TEntityService<TEntity>,
    entityStoreSlot: TEntityStoreSlot<TEntity>,
    key: TOIMStoreKey,
    rowIds: readonly TOIMStoreKey[]
): void {
    const heldRows = rowIds.map(id => entityService.holdSlotByKey(entityStoreSlot, id));
    const bucketSlot = bucketService.holdSlotByKey(bucketStoreSlot, key);
    try {
        bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, heldRows);
    } finally {
        bucketSlot.owner.unholdSlot(bucketSlot);
        for (const one of heldRows) one.owner.unholdSlot(one);
    }
}

/** The same, over the global index's one bucket. */
export function setSingleBucketSlots<TEntity extends object>(
    singleBucket: TGlobalBucket<TEntity>,
    entityService: TEntityService<TEntity>,
    entityStoreSlot: TEntityStoreSlot<TEntity>,
    rowIds: readonly TOIMStoreKey[]
): void {
    const heldRows = rowIds.map(id => entityService.holdSlotByKey(entityStoreSlot, id));
    try {
        singleBucket.bucketService.slotContentService.writeBucketMemberSlots(singleBucket.bucket, heldRows);
    } finally {
        for (const one of heldRows) one.owner.unholdSlot(one);
    }
}

export function updateEntityByKey<TEntity extends object>(
    entityService: TEntityService<TEntity>, entityStoreSlot: TEntityStoreSlot<TEntity>, key: TOIMStoreKey, patch: Partial<TEntity>,
): void {
    entityService.slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, key), patch);
}

export function deleteEntityByKey<TEntity extends object>(
    entityService: TEntityService<TEntity>, entityStoreSlot: TEntityStoreSlot<TEntity>, key: TOIMStoreKey,
): void {
    const entitySlot = entityService.findSlotByKey(entityStoreSlot, key);
    if (entitySlot !== undefined) entityService.slotContentService.deleteEntity(entitySlot);
}

/** The keys of every row of a population that holds a value. */
export function everyRow<TEntity extends object>(
    entityService: TEntityService<TEntity>,
    entityStoreSlot: TEntityStoreSlot<TEntity>
): TOIMStoreKey[] {
    const ids: TOIMStoreKey[] = [];
    for (const slot of entityService.getSlots(entityStoreSlot)) {
        if (slot.entity !== undefined) ids.push(slot.key);
    }
    return ids;
}

/**
 * How many effects read this identity — what `db.subscriberCount` used to
 * answer. A subscription is an entry in `slot.effects` and nothing else.
 */
export function subscriberCount(slot: TOIMSlot): number {
    return slot.effects?.length ?? 0;
}
