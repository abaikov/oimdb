import { useOIMSelector } from './useOIMSelector';

export function useOIMSingleComputedValue<TValue>(
    singleSlotStoreAggregate: { getSingleSlot(): { readonly value: TValue } },
): TValue {
    return useOIMSelector(() => singleSlotStoreAggregate.getSingleSlot().value, [singleSlotStoreAggregate]);
}
