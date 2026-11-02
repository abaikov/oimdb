import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export interface IOIMSlotFilingService<TSlot extends TOIMSlot = TOIMSlot, TStore = unknown> {
    createStore(): TStore;
    set(store: TStore, slot: TSlot): void;
    delete(store: TStore, slot: TSlot): void;
}
