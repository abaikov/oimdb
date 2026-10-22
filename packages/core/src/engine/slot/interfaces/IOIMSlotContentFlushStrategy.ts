import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMStoreSlot } from '../types/TOIMStoreSlot';
import type { IOIMSlotOwner } from './IOIMSlotOwner';

export interface IOIMSlotContentFlushStrategy<TSlot extends TOIMSlot, TSlotOwnerService extends IOIMSlotOwner = IOIMSlotOwner> {
    onSubframeClosed(storeSlot: TOIMStoreSlot<unknown, TSlot>, slotOwnerService: TSlotOwnerService): void;
}
