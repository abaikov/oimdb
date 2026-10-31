import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import { OIMEntitySlot } from '../OIMEntitySlot';

export function createOIMEntityContentSlot<TEntity extends object>(
    owner: IOIMSlotOwner,
    storeSlot: TOIMStoreSlot,
): OIMEntitySlot<TEntity> {
    return new OIMEntitySlot<TEntity, NonNullable<unknown>>(undefined as unknown as NonNullable<unknown>, owner, storeSlot);
}
