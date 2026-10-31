import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';
import type { TOIMComputedSources } from './TOIMComputedSources';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export type TOIMComputedStoreSlot<
    TStore = unknown, TValue = unknown, TComputedSlot extends TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined> = TOIMComputedContentSlot<TValue>,
    TSlotService = unknown,
> = TOIMStoreSlot<TStore, TComputedSlot, unknown, TSlotService> & {
    readonly derive: ((computedSlot: TComputedSlot) => TValue) | undefined;
    readonly createSources: ((computedSlot: TComputedSlot) => Partial<TOIMComputedSources>) | undefined;
};
