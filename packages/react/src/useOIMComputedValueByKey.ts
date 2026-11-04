import { useOIMSelector } from './useOIMSelector';

export function useOIMComputedValueByKey<TValue, TKey>(
    slotCollectionStoreAggregate: { getSlotByKey(key: TKey): { readonly value: TValue } },
    key: NoInfer<TKey>,
): TValue {
    return useOIMSelector(() => slotCollectionStoreAggregate.getSlotByKey(key).value);
}
