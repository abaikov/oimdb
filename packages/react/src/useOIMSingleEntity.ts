import type { OIMSingleSlotService, TOIMEntityContentSlot, TOIMSingleSlotStore, TOIMStoreSlot } from '@oimdb/core';
import { useOIMSingleSlot } from './useOIMSingleSlot';

export function useOIMSingleEntity<TEntity extends object>(
    singleSlotStoreSlot: TOIMStoreSlot<
        TOIMSingleSlotStore<TOIMEntityContentSlot<TEntity>>, TOIMEntityContentSlot<TEntity>, unknown,
        Pick<OIMSingleSlotService<TOIMEntityContentSlot<TEntity>, unknown>, 'getSingleSlot' | 'holdSingleSlot'>
    >,
): TEntity | undefined {
    return useOIMSingleSlot('useOIMSingleEntity', singleSlotStoreSlot).entity;
}
