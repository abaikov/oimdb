import { useOIMSelector } from './useOIMSelector';

export function useOIMEntityByKey<TEntity extends object, TKey>(
    slotCollectionStoreAggregate: { getSlotByKey(key: TKey): { readonly entity: TEntity | undefined } },
    key: NoInfer<TKey>,
): TEntity | undefined {
    return useOIMSelector(() => slotCollectionStoreAggregate.getSlotByKey(key).entity);
}
