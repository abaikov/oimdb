import { useMemo, useRef } from 'react';
import { OIM_FROZEN_EMPTY_SLOTS } from '@oimdb/core';
import type {
    OIMSlotCollectionService, TOIMComputedSlot, TOIMDisposer, TOIMKeyedSlot, TOIMSlot, TOIMStoreSlot,
} from '@oimdb/core';
import { oimAssertOneChannel } from './oimAssertOneChannel';
import { useOIMDB } from './useOIMDB';
import { OIMSnapshotVersion } from './OIMSnapshotVersion';
import { useOIMSnapshotVersion } from './useOIMSnapshotVersion';

const sourcesOfRootSlot = (rootSlot: TOIMSlot): readonly [readonly TOIMSlot[], readonly TOIMComputedSlot[]] =>
    [[rootSlot], OIM_FROZEN_EMPTY_SLOTS];

export function useOIMSlotByKey<TKey, TSlot extends TOIMKeyedSlot<TKey>, TStore>(
    hookName: string,
    slotCollectionService: Pick<OIMSlotCollectionService<TKey, TSlot, TStore, unknown>, 'getSlotByKey' | 'holdSlotByKey'>,
    storeSlot: TOIMStoreSlot<TStore, TSlot>,
    key: TKey,
    sourcesOfSlot: (slot: NoInfer<TSlot>) => readonly [readonly TOIMSlot[], readonly TOIMComputedSlot[]] = sourcesOfRootSlot,
): TSlot {
    const db = useOIMDB();
    const lastSeenKeyRef = useRef(key);
    const settledKeyRef = useRef(key);
    if (key !== lastSeenKeyRef.current) {
        lastSeenKeyRef.current = key;
        if (slotCollectionService.getSlotByKey(storeSlot, key) !== slotCollectionService.getSlotByKey(storeSlot, settledKeyRef.current)) {
            settledKeyRef.current = key;
        }
    }
    const settledKey = settledKeyRef.current;
    const store = useMemo(() => {
        const snapshotVersion = new OIMSnapshotVersion();
        let subscribedSlot: TSlot | undefined = undefined;
        return {
            snapshotVersion,
            subscribe: (onStoreChange: () => void): TOIMDisposer => {
                const holdingSlot = slotCollectionService.holdSlotByKey(storeSlot, settledKey);
                try {
                    oimAssertOneChannel(db, holdingSlot, hookName);
                    const [sourceSlots, sourceComputeds] = sourcesOfSlot(holdingSlot);
                    const disposeEffect = snapshotVersion.subscribeEffect(db, sourceSlots, sourceComputeds, onStoreChange);
                    subscribedSlot = holdingSlot;
                    return () => {
                        subscribedSlot = undefined;
                        disposeEffect();
                    };
                } finally {
                    holdingSlot.owner.unholdSlot(holdingSlot);
                }
            },
            getSlot: (): TSlot => subscribedSlot ?? slotCollectionService.getSlotByKey(storeSlot, settledKey),
        };
    }, [hookName, db, slotCollectionService, storeSlot, settledKey, sourcesOfSlot]);

    useOIMSnapshotVersion(store.snapshotVersion, store.subscribe);
    return store.getSlot();
}
