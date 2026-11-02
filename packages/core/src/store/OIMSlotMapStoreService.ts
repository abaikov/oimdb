import type { IOIMSlotStoreService } from './interfaces/IOIMSlotStoreService';
import type { TOIMStoreKey } from './types/TOIMStoreKey';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import { oimSameValueZeroGuard } from '../slot/utils/oimSameValueZeroGuard';

export class OIMSlotMapStoreService<
    TSlot extends TOIMKeyedSlot<TKey>,
    TKey extends NonNullable<unknown> = TSlot extends TOIMKeyedSlot<infer TSlotKey> ? TSlotKey : TOIMStoreKey,
>
implements IOIMSlotStoreService<TKey, TSlot, Map<TKey, TSlot>> {
    public static readonly INSTANCE = new OIMSlotMapStoreService<TOIMKeyedSlot, NonNullable<unknown>>();

    public createStore(): Map<TKey, TSlot> { return new Map<TKey, TSlot>(); }

    public ownKey<TOwnedKey extends TKey>(key: TOwnedKey): TOwnedKey { return key; }

    public isSameKey(key: TKey, otherKey: TKey): boolean { return oimSameValueZeroGuard(key, otherKey); }

    public get(store: Map<TKey, TSlot>, key: TKey): TSlot | undefined {
        return store.get(key);
    }

    public set(store: Map<TKey, TSlot>, slot: TSlot): void {
        store.set(slot.key, slot);
    }

    public delete(store: Map<TKey, TSlot>, slot: TSlot): void { store.delete(slot.key); }

    public getSlots(store: Map<TKey, TSlot>): IterableIterator<TSlot> { return store.values(); }

    public getSlotCount(store: Map<TKey, TSlot>): number { return store.size; }
}
