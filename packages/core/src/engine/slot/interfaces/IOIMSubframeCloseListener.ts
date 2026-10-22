import type { TOIMStoreSlot } from '../types/TOIMStoreSlot';

export interface IOIMSubframeCloseListener {
    onStoreSlotSubframeClosed(storeSlot: TOIMStoreSlot): void;
}
