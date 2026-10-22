import type { TOIMSingleSlotStore } from './TOIMSingleSlotStore';

export type TOIMDefaultSlotStore<TKey, TSlot> = [TKey] extends [void] ? TOIMSingleSlotStore<TSlot> : Map<TKey, TSlot>;
