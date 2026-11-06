import { useOIMSelector } from './useOIMSelector';

export function useOIMEntitiesByKey<TEntity extends object, TKey>(
    slotCollectionIndexStoreAggregate: { getEntitiesByKey(key: TKey): TEntity[] },
    key: NoInfer<TKey>,
): readonly TEntity[] {
    return useOIMSelector(() => slotCollectionIndexStoreAggregate.getEntitiesByKey(key), [slotCollectionIndexStoreAggregate, key]);
}
