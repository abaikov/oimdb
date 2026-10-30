import type { OIMSlotOwnerService } from '../../slot/OIMSlotOwnerService';
import type { OIMPushColumnSlotOwner } from '../../column/OIMPushColumnSlotOwner';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { TOIMEntityContentSlot } from './TOIMEntityContentSlot';
import type { TOIMEntitySlot } from './TOIMEntitySlot';

export type TOIMEntitySlotOwnerService<
    TEntity extends object, TEntitySlot extends TOIMEntityContentSlot<TEntity> = TOIMEntitySlot<TEntity>,
    TStore = unknown, TColumnName extends string = string,
> = OIMSlotOwnerService<TEntitySlot, TStore, TColumnName, TOIMColumnSlot, OIMPushColumnSlotOwner, Partial<TEntity>>;
