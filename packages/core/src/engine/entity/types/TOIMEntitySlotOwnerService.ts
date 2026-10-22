import type { OIMSlotOwnerService } from '../../slot/OIMSlotOwnerService';
import type { OIMColumnOwnerPushDriven } from '../../column/OIMColumnOwnerPushDriven';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { TOIMEntitySlot } from './TOIMEntitySlot';

export type TOIMEntitySlotOwnerService<TEntity extends object, TKey, TStore = unknown, TColumnName extends string = string> =
    OIMSlotOwnerService<TKey, TOIMEntitySlot<TEntity, TKey>, TStore, TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>>;
