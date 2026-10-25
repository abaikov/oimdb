import { OIM_FROZEN_EMPTY_SLOTS } from '@oimdb/core';
import type {
    OIMSlotCollectionService, TOIMComputedContentSlot, TOIMComputedSlot, TOIMSlot, TOIMStoreKey, TOIMStoreSlot,
} from '@oimdb/core';
import { useOIMSlotByKey } from './useOIMSlotByKey';

const sourcesOfComputedSlot = (computedSlot: TOIMComputedContentSlot): readonly [readonly TOIMSlot[], readonly TOIMComputedContentSlot[]] =>
    [OIM_FROZEN_EMPTY_SLOTS, [computedSlot]];

export function useOIMComputedValueByKey<TValue, TKey extends NonNullable<unknown> = TOIMStoreKey, TStore = unknown>(
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
