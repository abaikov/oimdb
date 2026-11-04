import { useOIMSelector } from './useOIMSelector';

export function useOIMEntities<TEntity extends object>(
    entitySlotCollectionStoreAggregate: { getEntities(): TEntity[] },
): readonly TEntity[] {
    return useOIMSelector(() => entitySlotCollectionStoreAggregate.getEntities());
}
