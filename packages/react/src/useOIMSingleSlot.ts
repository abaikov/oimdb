import { useMemo } from 'react';
import { OIM_FROZEN_EMPTY_SLOTS } from '@oimdb/core';
import type {
    OIMSingleSlotService, TOIMComputedContentSlot, TOIMDisposer, TOIMSlot, TOIMSingleSlotStore, TOIMStoreSlot,
} from '@oimdb/core';
import { oimSubscribeHeldSlot } from './oimSubscribeHeldSlot';
import { useOIMDB } from './useOIMDB';
import { OIMSnapshotVersion } from './OIMSnapshotVersion';
import { useOIMSnapshotVersion } from './useOIMSnapshotVersion';

const sourcesOfRootSlot = (rootSlot: TOIMSlot): readonly [readonly TOIMSlot[], readonly TOIMComputedContentSlot[]] =>
    [[rootSlot], OIM_FROZEN_EMPTY_SLOTS];

export function useOIMSingleSlot<TSlot extends TOIMSlot>(
    hookName: string,
    singleSlotService: Pick<OIMSingleSlotService<TSlot, unknown>, 'getSingleSlot' | 'holdSingleSlot'>,
    singleSlotStoreSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot>,
    sourcesOfSlot: (slot: NoInfer<TSlot>) => readonly [readonly TOIMSlot[], readonly TOIMComputedContentSlot[]] = sourcesOfRootSlot,
): TSlot {
    const db = useOIMDB();
    const store = useMemo(() => {
        const snapshotVersion = new OIMSnapshotVersion();
        let subscribedSlot: TSlot | undefined = undefined;
        return {
            snapshotVersion,
            subscribe: (onStoreChange: () => void): TOIMDisposer => {
                const holdingSlot = singleSlotService.holdSingleSlot(singleSlotStoreSlot);
                const effectDisposer = oimSubscribeHeldSlot(db, hookName, snapshotVersion, holdingSlot, sourcesOfSlot, onStoreChange);
                subscribedSlot = holdingSlot;
                return () => {
                    subscribedSlot = undefined;
                    effectDisposer();
                };
            },
            getSlot: (): TSlot => subscribedSlot ?? singleSlotService.getSingleSlot(singleSlotStoreSlot),
        };
    }, [hookName, db, singleSlotService, singleSlotStoreSlot, sourcesOfSlot]);

    useOIMSnapshotVersion(store.snapshotVersion, store.subscribe);
    return store.getSlot();
}
