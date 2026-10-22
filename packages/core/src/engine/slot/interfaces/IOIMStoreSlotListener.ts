import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMStoreSlot } from '../types/TOIMStoreSlot';

export interface IOIMStoreSlotListener {
    onStoreSlotCreated<TStore, TSlot extends TOIMSlot, TPatch>(storeSlot: TOIMStoreSlot<TStore, TSlot, TPatch>): void;
}
