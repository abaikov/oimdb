import type { IOIMSlotFilingService } from './interfaces/IOIMSlotFilingService';
import type { TOIMSingleSlotStore } from './types/TOIMSingleSlotStore';
import type { TOIMSlot } from '../slot/types/TOIMSlot';

export class OIMSingleSlotStoreService<TSlot extends TOIMSlot>
implements IOIMSlotFilingService<TSlot, TOIMSingleSlotStore<TSlot>> {
    public static readonly INSTANCE = new OIMSingleSlotStoreService<TOIMSlot>();

    public createStore(): TOIMSingleSlotStore<TSlot> { return { slot: undefined }; }

    public getSingleSlot(store: TOIMSingleSlotStore<TSlot>): TSlot | undefined {
        return store.slot;
    }

    public set(store: TOIMSingleSlotStore<TSlot>, slot: TSlot): void {
        store.slot = slot;
    }

    public delete(store: TOIMSingleSlotStore<TSlot>): void { store.slot = undefined; }
}
