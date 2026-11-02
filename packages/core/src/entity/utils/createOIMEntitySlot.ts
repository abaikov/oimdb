import type { TOIMEntityColumnName } from '../types/TOIMEntityColumnName';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import { OIMEntitySlot } from '../OIMEntitySlot';

export function createOIMEntitySlot<TEntity extends object, TKey extends NonNullable<unknown>, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>>(
    key: TKey,
    owner: IOIMSlotOwner,
    storeSlot: TOIMStoreSlot,
): TOIMEntitySlot<TEntity, TKey, TColumnName> {
    return new OIMEntitySlot<TEntity, TKey, TColumnName>(key, owner, storeSlot);
}
