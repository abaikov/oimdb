import { useMemo, useRef, type DependencyList } from 'react';
import type { TOIMDisposer } from '@oimdb/core';
import { useOIMDB } from './useOIMDB';
import { OIMSnapshotVersion } from './OIMSnapshotVersion';
import { useOIMSnapshotVersion } from './useOIMSnapshotVersion';

export function useOIMSourceTrackingValue<TValue>(derive: () => TValue, deps: DependencyList): TValue {
    const db = useOIMDB();
    const deriveRef = useRef(derive);
    deriveRef.current = derive;
    const store = useMemo(() => {
        const snapshotVersion = new OIMSnapshotVersion();
        return {
            snapshotVersion,
            subscribe: (onStoreChange: () => void): TOIMDisposer => snapshotVersion.subscribeSourceTrackingEffect(
                db, onStoreChange, () => { deriveRef.current(); },
            ),
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's list is checked at the call site
    }, [db, ...deps]);
    useOIMSnapshotVersion(store.snapshotVersion, store.subscribe);
    return derive();
}
