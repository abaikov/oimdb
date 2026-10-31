import type { IOIMSlotOwner } from './IOIMSlotOwner';
import type { TOIMKeyedSlot } from '../types/TOIMKeyedSlot';
import type { TOIMStoreSlot } from '../types/TOIMStoreSlot';

export interface IOIMKeyedSlotCreator<TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot> {
    createSlot(key: TKey, storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TSlot;
}
