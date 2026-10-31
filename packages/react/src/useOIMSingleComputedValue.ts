import { useMemo } from 'react';
import type { DependencyList } from 'react';
import { OIM_FROZEN_EMPTY_SLOTS } from '@oimdb/core';
import type {
    OIMSingleComputedService, TOIMComputedContentSlot, TOIMComputedSources, TOIMSlot,
} from '@oimdb/core';
import { useOIMSingleSlot } from './useOIMSingleSlot';
import { useOIMDB } from './useOIMDB';

const sourcesOfComputedSlot = (computedSlot: TOIMComputedContentSlot): readonly [readonly TOIMSlot[], readonly TOIMComputedContentSlot[]] =>
    [OIM_FROZEN_EMPTY_SLOTS, [computedSlot]];

export function useOIMSingleComputedValue<TValue>(
    computedService: OIMSingleComputedService<TValue>,
    derive: ((computedSlot: TOIMComputedContentSlot<TValue>) => TValue) | undefined,
    createSources: ((computedSlot: TOIMComputedContentSlot<TValue>) => Partial<TOIMComputedSources>) | undefined,
    dependencyList: DependencyList,
): TValue {
    const db = useOIMDB();
    const computedStoreSlot = useMemo(
        () => computedService.createComputedStoreSlot(db, derive, createSources),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's list is checked at the call site
        [db, computedService, ...dependencyList],
    );
    const computedSlot = useOIMSingleSlot('useOIMSingleComputedValue', computedStoreSlot, sourcesOfComputedSlot);
    return computedSlot.computedValueService.getValueForSlot(computedSlot);
}
