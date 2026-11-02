import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';

export type TOIMSlotCollectionStoreSlot<TSlot extends TOIMSlot = TOIMSlot> =
    TOIMStoreSlot<unknown, TSlot, unknown, { getSlots(storeSlot: TOIMStoreSlot<unknown, TSlot>): Iterable<TSlot> }>;
