import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import { OIMEntitySlot } from '../OIMEntitySlot';

export function createOIMEntitySlot<TEntity extends object, TKey extends NonNullable<unknown>>(
    key: TKey,
    owner: IOIMSlotOwner,
    storeSlot: TOIMStoreSlot,
): TOIMEntitySlot<TEntity, TKey> {
    return new OIMEntitySlot<TEntity, TKey>(key, owner, storeSlot);
}
