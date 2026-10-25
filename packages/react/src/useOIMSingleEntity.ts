import type { OIMSingleSlotService, TOIMEntityContentSlot, TOIMSingleSlotStore, TOIMStoreSlot } from '@oimdb/core';
import { useOIMSingleSlot } from './useOIMSingleSlot';

export function useOIMSingleEntity<TEntity extends object>(
    singleSlotService: Pick<OIMSingleSlotService<TOIMEntityContentSlot<TEntity>, unknown>, 'getSingleSlot' | 'holdSingleSlot'>,
    singleSlotStoreSlot: TOIMStoreSlot<TOIMSingleSlotStore<TOIMEntityContentSlot<TEntity>>, TOIMEntityContentSlot<TEntity>>,
): TEntity | undefined {
    return useOIMSingleSlot('useOIMSingleEntity', singleSlotService, singleSlotStoreSlot).entity;
}
