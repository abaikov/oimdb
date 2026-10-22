import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';

export interface IOIMSlotStoreService<TKey, TSlot extends TOIMKeyedSlot = TOIMKeyedSlot, TStore = unknown> {
    createStore(): TStore;
    ownKey<TOwnedKey extends TKey>(key: TOwnedKey): TOwnedKey;
    isSameKey(key: TKey, otherKey: TKey): boolean;
    get(store: TStore, key: TKey): TSlot | undefined;
    set(store: TStore, key: TKey, slot: TSlot): void;
    remove(store: TStore, key: TKey): void;
    getSlots(store: TStore): IterableIterator<TSlot>;
    getSlotCount(store: TStore): number;
}
