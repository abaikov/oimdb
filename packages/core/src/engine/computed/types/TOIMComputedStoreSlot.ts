import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { TOIMComputedSlot } from './TOIMComputedSlot';
import type { TOIMComputedSources } from './TOIMComputedSources';

export type TOIMComputedStoreSlot<TStore = unknown, TValue = unknown, TKey = unknown> =
    TOIMStoreSlot<TStore, TOIMComputedSlot<TValue, TKey>> & {
        readonly derive: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue) | undefined;
        readonly createSources: ((key: TKey, storeSlot: TOIMStoreSlot | undefined) => Partial<TOIMComputedSources>) | undefined;
    };
