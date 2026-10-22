import type { IOIMSlotStoreService } from './interfaces/IOIMSlotStoreService';
import type { TOIMSingleSlotStore } from './types/TOIMSingleSlotStore';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import { OIM_FROZEN_EMPTY_SLOTS } from '../slot/constants/OIM_FROZEN_EMPTY_SLOTS';

export class OIMSlotStoreServiceSingleSlotDriven<TSlot extends TOIMKeyedSlot<void>>
implements IOIMSlotStoreService<void, TSlot, TOIMSingleSlotStore<TSlot>> {
    public static readonly INSTANCE = new OIMSlotStoreServiceSingleSlotDriven<TOIMKeyedSlot<void>>();

    public createStore(): TOIMSingleSlotStore<TSlot> { return { slot: undefined }; }

    public ownKey<TOwnedKey extends void>(key: TOwnedKey): TOwnedKey { return key; }

    public isSameKey(): boolean { return true; }

    public get(store: TOIMSingleSlotStore<TSlot>): TSlot | undefined {
        return store.slot;
    }

    public set(store: TOIMSingleSlotStore<TSlot>, _key: void, slot: TSlot): void {
        store.slot = slot;
    }

    public remove(store: TOIMSingleSlotStore<TSlot>): void { store.slot = undefined; }

    public getSlots(store: TOIMSingleSlotStore<TSlot>): IterableIterator<TSlot> {
        const slot = store.slot;
        return slot === undefined ? (OIM_FROZEN_EMPTY_SLOTS as readonly TSlot[]).values() : [slot].values();
    }

    public getSlotCount(store: TOIMSingleSlotStore<TSlot>): number { return store.slot === undefined ? 0 : 1; }
}
