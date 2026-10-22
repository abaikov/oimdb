import type { TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import type { TOIMReduxDefaultGlobalIndexState } from '../types/TOIMReduxDefaultGlobalIndexState';
import type { TOIMReduxGlobalIndex } from '../types/TOIMReduxGlobalIndex';

// The raw `slot.key` goes into the array, never a property name: a bucket erases
// the key type it holds, and a numeric pk must come back a number.
export function oimDefaultGlobalIndexMapper<
    TPk extends TOIMStoreKey,
    TEntity extends object,
    TEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
    TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
>(
    globalIndex: TOIMReduxGlobalIndex<TPk, TEntity, TEntityStore, TBucketStore>,
    _currentState?: TOIMReduxDefaultGlobalIndexState<TPk>
): TOIMReduxDefaultGlobalIndexState<TPk> {
    const ids: TPk[] = [];
    for (const entitySlot of globalIndex.bucketService.slotContentService.getBucketMemberSlots(globalIndex.bucketSlot)) ids.push(entitySlot.key as TPk);
    return { ids };
}
