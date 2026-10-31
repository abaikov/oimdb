import type { IOIMSlotOwner } from './IOIMSlotOwner';
import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMStoreSlot } from '../types/TOIMStoreSlot';

export interface IOIMSingleSlotCreator<TSlot extends TOIMSlot> {
    createSingleSlot(storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TSlot;
}
