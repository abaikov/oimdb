import { useMemo } from 'react';
import type { DependencyList } from 'react';
import type {
    OIMComputedService, TOIMComputedSlot, TOIMComputedSources, TOIMSingleSlotStore, TOIMStoreSlot,
} from '@oimdb/core';
import { useOIMComputedValueByKey } from './useOIMComputedValueByKey';
import { useOIMDB } from './useOIMDB';

export function useOIMSingleComputedValue<TValue>(
    computedService: OIMComputedService<void, TValue, TOIMSingleSlotStore<TOIMComputedSlot<TValue, void>>>,
    derive: ((computedSlot: TOIMComputedSlot<TValue, void>) => TValue) | undefined,
    createSources: ((key: void, storeSlot: TOIMStoreSlot | undefined) => Partial<TOIMComputedSources>) | undefined,
    dependencyList: DependencyList,
): TValue {
    const db = useOIMDB();
    const computedStoreSlot = useMemo(
        () => computedService.createComputedStoreSlot(db, derive, createSources),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's list is checked at the call site
        [db, computedService, ...dependencyList],
    );
    return useOIMComputedValueByKey<TValue, void, TOIMSingleSlotStore<TOIMComputedSlot<TValue, void>>>(
        computedService.computedCollectionService, computedStoreSlot, undefined,
    );
}
