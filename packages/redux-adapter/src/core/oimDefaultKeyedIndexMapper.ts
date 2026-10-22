import type { TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import type { TOIMReduxDefaultIndexState } from '../types/TOIMReduxDefaultIndexState';
import type { TOIMReduxKeyedIndex } from '../types/TOIMReduxKeyedIndex';

// A key that just emptied is minted a fresh empty bucket by this read and the
// collector takes it back at the next flush.
function readIds<
    TIndexKey extends TOIMStoreKey,
    TPk extends TOIMStoreKey,
    TEntity extends object,
    TBucketStore,
    TEntityStore,
>(
    keyedIndex: TOIMReduxKeyedIndex<TIndexKey, TPk, TEntity, TBucketStore, TEntityStore>,
    key: TIndexKey
): TPk[] {
    const bucketSlot = keyedIndex.bucketService.getSlotByKey(keyedIndex.bucketStoreSlot, key);
    const ids: TPk[] = [];
    for (const entitySlot of keyedIndex.bucketService.slotContentService.getBucketMemberSlots(bucketSlot)) ids.push(entitySlot.key as TPk);
    return ids;
}

// The unnamed bucket is not merely missing from the state: the sync-back finds
// it absent from what Redux lists and CLEARS IT.
function collidingKeysError(key: TOIMStoreKey, claimedByStoreKey: TOIMStoreKey): Error {
    return new Error(
        `oimDefaultKeyedIndexMapper: index keys ${JSON.stringify(claimedByStoreKey)} and ` +
        `${JSON.stringify(key)} are two buckets in the index and one property ` +
        `name in the Redux state, which cannot hold both — and the entry that ` +
        `loses is a bucket the sync-back would then empty. Address the index ` +
        `with a single key type, or supply a mapper whose state shape keeps ` +
        `the two apart.`
    );
}

export function oimDefaultKeyedIndexMapper<
    TIndexKey extends TOIMStoreKey,
    TPk extends TOIMStoreKey,
    TEntity extends object,
    TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
    TEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
>(
    keyedIndex: TOIMReduxKeyedIndex<TIndexKey, TPk, TEntity, TBucketStore, TEntityStore>,
    updatedKeys: Set<TIndexKey>,
    currentState?: TOIMReduxDefaultIndexState<TIndexKey, TPk>
): TOIMReduxDefaultIndexState<TIndexKey, TPk> {
    if (!currentState) {
        const entities = {} as Record<TIndexKey, { id: TIndexKey; ids: TPk[] }>;
        {
            // The filter is for buckets somebody holds empty, not a graveyard:
            // `unhold` already dropped the unheld ones.
            for (const bucketSlot of keyedIndex.bucketService.getSlots(keyedIndex.bucketStoreSlot)) {
                if (keyedIndex.bucketService.slotContentService.getBucketMemberSlotCount(bucketSlot) === 0) continue;
                const key = bucketSlot.key as TIndexKey;
                // Every bucket appears once here, so a taken name means a
                // second key.
                const claimed: { id: TIndexKey; ids: TPk[] } | undefined = entities[key];
                if (claimed !== undefined) throw collidingKeysError(key, claimed.id);
                entities[key] = { id: key, ids: readIds(keyedIndex, key) };
            }
        }
        return { entities };
    }

    const newEntities = { ...currentState.entities };
    for (const key of updatedKeys) {
        // Both writes below address `newEntities` by property name, so without
        // this the `delete` drops the OTHER key's live bucket from the state.
        const claimed: { id: TIndexKey; ids: TPk[] } | undefined = newEntities[key];
        if (claimed !== undefined && claimed.id !== key) {
            throw collidingKeysError(key, claimed.id);
        }
        const ids = readIds(keyedIndex, key);
        // An emptied key LEAVES the state: the from-scratch branch skips empty
        // buckets, and an entry written here is never removed anywhere else.
        if (ids.length === 0) {
            delete newEntities[key];
            continue;
        }
        newEntities[key] = { id: key, ids };
    }
    return { entities: newEntities };
}
