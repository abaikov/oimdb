import { useDebugValue, useMemo, useSyncExternalStore } from 'react';
import { OIMSourceTracker } from '@oimdb/core';
import type { OIMDB } from '@oimdb/core';
import { useOIMDB } from './useOIMDB';
import { OIMSelectorSubscription } from './OIMSelectorSubscription';
import { useOIMIsomorphicLayoutEffect } from './useOIMIsomorphicLayoutEffect';

export function useOIMSelector<TValue, TDB extends OIMDB = OIMDB>(select: (db: TDB) => TValue): TValue {
    const db = useOIMDB.withTypes<TDB>()();
    const selectorSubscription = useMemo(() => new OIMSelectorSubscription(db), [db]);
    useSyncExternalStore(selectorSubscription.subscribe, selectorSubscription.getVersion, selectorSubscription.getVersion);
    const clock = db.clock;
    const renderedAtRevision = clock.revision;
    const renderedAtEpoch = clock.epoch;
    const sourceTracker = new OIMSourceTracker();
    const value = sourceTracker.runSourceTracking(() => select(db));
    useOIMIsomorphicLayoutEffect(() => {
        selectorSubscription.commitRender(sourceTracker, renderedAtRevision, renderedAtEpoch);
    });
    useDebugValue(value);
    return value;
}

useOIMSelector.withTypes = <TDB extends OIMDB>(): (<TValue>(select: (db: TDB) => TValue) => TValue) => useOIMSelector;
