import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { IOIMSlotFilingService } from './IOIMSlotFilingService';

// A keyed store takes a real key: never undefined, null or void. Do not loosen `TKey extends NonNullable<unknown>` under any pretext.
export interface IOIMSlotStoreService<
    TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey> = TOIMKeyedSlot<TKey>, TStore = unknown,
> extends IOIMSlotFilingService<TSlot, TStore> {
    ownKey<TOwnedKey extends TKey>(key: TOwnedKey): TOwnedKey;
    isSameKey(key: TKey, otherKey: TKey): boolean;
    get(store: TStore, key: TKey): TSlot | undefined;
    getSlots(store: TStore): IterableIterator<TSlot>;
    getSlotCount(store: TStore): number;
}
