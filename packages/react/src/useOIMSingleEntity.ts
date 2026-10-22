import type { OIMSingleSlotService, TOIMEntitySlot, TOIMSingleSlotStore, TOIMStoreSlot } from '@oimdb/core';
import { useOIMSingleSlot } from './useOIMSingleSlot';

export function useOIMSingleEntity<TEntity extends object>(
    singleSlotService: Pick<OIMSingleSlotService<TOIMEntitySlot<TEntity, void>, unknown>, 'getSingleSlot' | 'holdSingleSlot'>,
    singleSlotStoreSlot: TOIMStoreSlot<TOIMSingleSlotStore<TOIMEntitySlot<TEntity, void>>, TOIMEntitySlot<TEntity, void>>,
): TEntity | undefined {
    return useOIMSingleSlot('useOIMSingleEntity', singleSlotService, singleSlotStoreSlot).entity;
}
