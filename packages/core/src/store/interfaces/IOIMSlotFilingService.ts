import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export interface IOIMSlotFilingService<TSlot extends TOIMSlot = TOIMSlot, TStore = unknown> {
    createStore(): TStore;
    fileSlot(store: TStore, slot: TSlot): void;
    unfileSlot(store: TStore, slot: TSlot): void;
    getSlots(store: TStore): IterableIterator<TSlot>;
    getSlotCount(store: TStore): number;
}
