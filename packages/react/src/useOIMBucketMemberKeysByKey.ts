import { useOIMSelector } from './useOIMSelector';

export function useOIMBucketMemberKeysByKey<TMemberKey, TKey>(
    slotCollectionIndexStoreAggregate: { getSlotByKey(key: TKey): { getBucketMemberSlots(): Iterable<{ readonly key: TMemberKey }> } },
    key: NoInfer<TKey>,
): readonly TMemberKey[] {
    return useOIMSelector(() => Array.from(slotCollectionIndexStoreAggregate.getSlotByKey(key).getBucketMemberSlots(), bucketMemberSlot => bucketMemberSlot.key));
}
