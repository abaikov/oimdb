import { useOIMSelector } from './useOIMSelector';

export function useOIMSingleEntity<TEntity extends object>(
    singleSlotStoreAggregate: { getSingleSlot(): { readonly entity: TEntity | undefined } },
): TEntity | undefined {
    return useOIMSelector(() => singleSlotStoreAggregate.getSingleSlot().entity, [singleSlotStoreAggregate]);
}
