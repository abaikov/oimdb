import { OIM_FROZEN_EMPTY_SLOTS } from '@oimdb/core';
import type {
    OIMSlotCollectionService, TOIMComputedSlot, TOIMSlot, TOIMStoreKey, TOIMStoreSlot,
} from '@oimdb/core';
import { useOIMSlotByKey } from './useOIMSlotByKey';

const sourcesOfComputedSlot = (computedSlot: TOIMComputedSlot): readonly [readonly TOIMSlot[], readonly TOIMComputedSlot[]] =>
    [OIM_FROZEN_EMPTY_SLOTS, [computedSlot]];

export function useOIMComputedValueByKey<TValue, TKey = TOIMStoreKey, TStore = unknown>(
    computedCollectionService: Pick<
        OIMSlotCollectionService<TKey, TOIMComputedSlot<TValue, TKey>, TStore, unknown>, 'getSlotByKey' | 'holdSlotByKey'
    >,
    computedStoreSlot: TOIMStoreSlot<TStore, TOIMComputedSlot<TValue, TKey>>,
    key: TKey,
): TValue {
    const computedSlot = useOIMSlotByKey(
        'useOIMComputedValueByKey', computedCollectionService, computedStoreSlot, key, sourcesOfComputedSlot,
    );
    return computedSlot.computedValueService.getValueForSlot(computedSlot);
}
