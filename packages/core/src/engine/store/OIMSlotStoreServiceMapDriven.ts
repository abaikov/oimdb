import type { IOIMSlotStoreService } from './interfaces/IOIMSlotStoreService';
import type { TOIMStoreKey } from './types/TOIMStoreKey';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import { oimSameValueZeroGuard } from '../slot/utils/oimSameValueZeroGuard';

export class OIMSlotStoreServiceMapDriven<TSlot extends TOIMKeyedSlot<TKey>, TKey = TSlot extends TOIMKeyedSlot<infer TSlotKey> ? TSlotKey : TOIMStoreKey>
implements IOIMSlotStoreService<TKey, TSlot, Map<TKey, TSlot>> {
    public static readonly INSTANCE = new OIMSlotStoreServiceMapDriven<TOIMKeyedSlot<unknown>, unknown>();

    public createStore(): Map<TKey, TSlot> { return new Map<TKey, TSlot>(); }

    public ownKey<TOwnedKey extends TKey>(key: TOwnedKey): TOwnedKey { return key; }

    public isSameKey(key: TKey, otherKey: TKey): boolean { return oimSameValueZeroGuard(key, otherKey); }

    public get(store: Map<TKey, TSlot>, key: TKey): TSlot | undefined {
        return store.get(key);
    }

    public set(store: Map<TKey, TSlot>, key: TKey, slot: TSlot): void {
        store.set(key, slot);
    }

    public remove(store: Map<TKey, TSlot>, key: TKey): void { store.delete(key); }

    public getSlots(store: Map<TKey, TSlot>): IterableIterator<TSlot> { return store.values(); }

    public getSlotCount(store: Map<TKey, TSlot>): number { return store.size; }
}
