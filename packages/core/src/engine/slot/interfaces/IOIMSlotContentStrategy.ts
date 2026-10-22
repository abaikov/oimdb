import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMStoreSlot } from '../types/TOIMStoreSlot';
import type { IOIMSlotOwner } from './IOIMSlotOwner';

export interface IOIMSlotContentStrategy<TSlot extends TOIMSlot, TKey, TSlotOwnerService extends IOIMSlotOwner = IOIMSlotOwner> {
    createSlot(key: TKey, storeSlot: TOIMStoreSlot | undefined, slotOwnerService: TSlotOwnerService): TSlot;
    isSlotEmpty(slot: TSlot): boolean;
    releaseSlotContent(slot: TSlot, slotOwnerService: TSlotOwnerService): void;
    hasReference(slot: TSlot): boolean;
}
