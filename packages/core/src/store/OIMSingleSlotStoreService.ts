import type { IOIMSlotFilingService } from './interfaces/IOIMSlotFilingService';
import type { TOIMSingleSlotStore } from './types/TOIMSingleSlotStore';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import { OIM_FROZEN_EMPTY_SLOTS } from '../slot/constants/OIM_FROZEN_EMPTY_SLOTS';

export class OIMSingleSlotStoreService<TSlot extends TOIMSlot>
implements IOIMSlotFilingService<TSlot, TOIMSingleSlotStore<TSlot>> {
    public static readonly INSTANCE = new OIMSingleSlotStoreService<TOIMSlot>();

    public createStore(): TOIMSingleSlotStore<TSlot> { return { slot: undefined }; }

    public getSingleSlot(store: TOIMSingleSlotStore<TSlot>): TSlot | undefined {
        return store.slot;
    }

    public fileSlot(store: TOIMSingleSlotStore<TSlot>, slot: TSlot): void {
        store.slot = slot;
    }

    public unfileSlot(store: TOIMSingleSlotStore<TSlot>): void { store.slot = undefined; }

    public getSlots(store: TOIMSingleSlotStore<TSlot>): IterableIterator<TSlot> {
        const slot = store.slot;
        return slot === undefined ? (OIM_FROZEN_EMPTY_SLOTS as readonly TSlot[]).values() : [slot].values();
    }

    public getSlotCount(store: TOIMSingleSlotStore<TSlot>): number { return store.slot === undefined ? 0 : 1; }
}
