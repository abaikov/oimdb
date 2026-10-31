import { useMemo, useRef } from 'react';
import { OIM_FROZEN_EMPTY_SLOTS } from '@oimdb/core';
import type {
    OIMSlotCollectionService, TOIMComputedContentSlot, TOIMDisposer, TOIMKeyedSlot, TOIMSlot, TOIMStoreSlot,
} from '@oimdb/core';
import { oimSubscribeHeldSlot } from './oimSubscribeHeldSlot';
import { useOIMDB } from './useOIMDB';
import { OIMSnapshotVersion } from './OIMSnapshotVersion';
import { useOIMSnapshotVersion } from './useOIMSnapshotVersion';

const sourcesOfRootSlot = (rootSlot: TOIMSlot): readonly [readonly TOIMSlot[], readonly TOIMComputedContentSlot[]] =>
    [[rootSlot], OIM_FROZEN_EMPTY_SLOTS];

export function useOIMSlotByKey<TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey>, TStore>(
    hookName: string,
    storeSlot: TOIMStoreSlot<TStore, TSlot, unknown, Pick<OIMSlotCollectionService<TKey, TSlot, TStore, unknown>, 'getSlotByKey' | 'holdSlotByKey'>>,
    key: TKey,
    sourcesOfSlot: (slot: NoInfer<TSlot>) => readonly [readonly TOIMSlot[], readonly TOIMComputedContentSlot[]] = sourcesOfRootSlot,
): TSlot {
    const db = useOIMDB();
    const slotCollectionService = storeSlot.slotService;
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
                const effectDisposer = oimSubscribeHeldSlot(db, hookName, snapshotVersion, holdingSlot, sourcesOfSlot, onStoreChange);
                subscribedSlot = holdingSlot;
                return () => {
                    subscribedSlot = undefined;
                    effectDisposer();
                };
            },
            getSlot: (): TSlot => subscribedSlot ?? slotCollectionService.getSlotByKey(storeSlot, settledKey),
        };
    }, [hookName, db, slotCollectionService, storeSlot, settledKey, sourcesOfSlot]);

    useOIMSnapshotVersion(store.snapshotVersion, store.subscribe);
    return store.getSlot();
}
