import { useDebugValue, useInsertionEffect, useMemo, useSyncExternalStore } from 'react';
import type { DependencyList } from 'react';
import type { OIMDB } from '@oimdb/core';
import { useOIMDB } from './useOIMDB';
import { OIMSelectorSubscription } from './OIMSelectorSubscription';
import { useOIMIsomorphicLayoutEffect } from './useOIMIsomorphicLayoutEffect';

export function useOIMSelector<TValue, TDB extends OIMDB = OIMDB>(select: (db: TDB) => TValue, deps?: DependencyList): TValue {
    const db = useOIMDB.withTypes<TDB>()();
    const selectorSubscription = useMemo(() => new OIMSelectorSubscription<TDB>(db), [db]);
    const version = useSyncExternalStore(selectorSubscription.subscribe, selectorSubscription.getVersion, selectorSubscription.getVersion);
    const committedSourceChangeCount = deps === undefined && !selectorSubscription.isLastTrackedSelect(select) ? 0 : selectorSubscription.getCommittedSourceChangeCount();
    const selectorRender = useMemo(
        () => selectorSubscription.renderSelector(select),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [selectorSubscription, version, committedSourceChangeCount, ...(deps ?? [select])],
    );
    const trackedSelectorRender = selectorRender.trackedSelectorRender;
    useInsertionEffect(() => {
        selectorSubscription.commitRender(trackedSelectorRender);
    }, [selectorSubscription, trackedSelectorRender]);
    useOIMIsomorphicLayoutEffect(() => {
        selectorSubscription.notifyIfOwed();
    }, [selectorSubscription, trackedSelectorRender]);
    useDebugValue(selectorRender.value);
    return selectorRender.value;
}

useOIMSelector.withTypes = <TDB extends OIMDB>(): (<TValue>(select: (db: TDB) => TValue, deps?: DependencyList) => TValue) => useOIMSelector;
