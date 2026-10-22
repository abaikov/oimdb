import type { TOIMSlot } from './TOIMSlot';
import type { TOIMStoreSlot } from './TOIMStoreSlot';
import type { TOIMSingleSlotStore } from '../../store/types/TOIMSingleSlotStore';

export type TOIMSingleSlotStoreSlot<TSlot extends TOIMSlot, TPatch = unknown> = TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot, TPatch>;
