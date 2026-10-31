import type { IOIMEntityWriter } from '../interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptinessPolicy } from '../../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMEntityContentSlot } from './TOIMEntityContentSlot';

export type TOIMEntityContentServiceOptions<TEntity extends object> = {
    entityWriter: IOIMEntityWriter;
    slotEmptinessPolicy: IOIMSlotEmptinessPolicy<TOIMEntityContentSlot<TEntity>>;
};
