import { useMemo } from 'react';
import { OIM_FROZEN_EMPTY_SLOTS, oimRefreshSourceComputeds, type TOIMDisposer } from '@oimdb/core';
import { useOIMDB } from './useOIMDB';
import type { TOIMBinding } from './types/TOIMBinding';
import { OIMSnapshotVersion } from './OIMSnapshotVersion';
import { useOIMSnapshotVersion } from './useOIMSnapshotVersion';

/**
 * Applies a binding: one `OIMEffectService.INSTANCE.subscribeEffect` over its roots, its derivations settled before
 * every read. THE BINDING MUST KEEP ITS IDENTITY ACROSS RENDERS — a fresh one per render
 * resubscribes on every commit and never converges, freezing the screen rather than
 * throwing. That, and why the snapshot is a counter bumped on subscribing, are in
 * ../README.md.
 */
export function useOIMValue<TValue>(binding: TOIMBinding<TValue>): TValue {
    const db = useOIMDB();
    const sourceComputeds = binding.sourceComputeds ?? OIM_FROZEN_EMPTY_SLOTS;
    const store = useMemo(() => {
        const snapshotVersion = new OIMSnapshotVersion();
        return {
            snapshotVersion,
            subscribe: (onStoreChange: () => void): TOIMDisposer => snapshotVersion.subscribeEffect(
                db, binding.sourceSlots ?? OIM_FROZEN_EMPTY_SLOTS, sourceComputeds, onStoreChange,
            ),
        };
    }, [db, binding, sourceComputeds]);

    useOIMSnapshotVersion(store.snapshotVersion, store.subscribe);
    oimRefreshSourceComputeds(sourceComputeds);
    return binding.derive();
}
