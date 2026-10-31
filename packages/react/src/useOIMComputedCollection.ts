import { useMemo } from 'react';
import type { DependencyList } from 'react';
import type {
    OIMComputedService, TOIMComputedSlot, TOIMComputedSources, TOIMComputedStoreSlot,
} from '@oimdb/core';
import { useOIMDB } from './useOIMDB';

export function useOIMComputedCollection<TKey extends NonNullable<unknown>, TValue, TStore>(
    computedService: OIMComputedService<TKey, TValue, TStore>,
    derive: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue) | undefined,
    createSources: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => Partial<TOIMComputedSources>) | undefined,
    dependencyList: DependencyList,
): TOIMComputedStoreSlot<TStore, TValue, TOIMComputedSlot<TValue, TKey>, OIMComputedService<TKey, TValue, TStore>['computedCollectionService']> {
    const db = useOIMDB();
    return useMemo(
        () => computedService.createComputedStoreSlot(db, derive, createSources),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's list is checked at the call site
        [db, computedService, ...dependencyList],
    );
}
