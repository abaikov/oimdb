import type { IOIMEntityWriter } from '../interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptiness } from '../../slot/interfaces/IOIMSlotEmptiness';
import type { TOIMSlotOwnerServiceOptions } from '../../slot/types/TOIMSlotOwnerServiceOptions';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { OIMColumnOwnerPushDriven } from '../../column/OIMColumnOwnerPushDriven';
import type { TOIMEntitySlot } from './TOIMEntitySlot';

export type TOIMSlotContentEntityServiceOptions<TEntity extends object, TKey, TStore, TColumnName extends string> = Pick<
    TOIMSlotOwnerServiceOptions<
        TKey, TOIMEntitySlot<TEntity, TKey>, TStore, TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>
    >,
    'slotStamp' | 'slotReleasePolicy' | 'slotStoreService' | 'columnOwnerOptions' | 'createColumnOwner'
> & {
    keyOf: (entity: TEntity) => TKey;
    entityWriter: IOIMEntityWriter;
    slotEmptiness: IOIMSlotEmptiness<TOIMEntitySlot<TEntity, TKey>>;
};
