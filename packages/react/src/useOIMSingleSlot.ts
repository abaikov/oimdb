import { useMemo } from 'react';
import type {
    OIMSingleSlotService, TOIMDisposer, TOIMKeyedSlot, TOIMSingleSlotStore, TOIMStoreSlot,
} from '@oimdb/core';
import { oimAssertOneChannel } from './oimAssertOneChannel';
import { useOIMDB } from './useOIMDB';
import { OIMSnapshotVersion } from './OIMSnapshotVersion';
import { useOIMSnapshotVersion } from './useOIMSnapshotVersion';

export function useOIMSingleSlot<TSlot extends TOIMKeyedSlot<void>>(
    hookName: string,
    singleSlotService: Pick<OIMSingleSlotService<TSlot, unknown>, 'getSingleSlot' | 'holdSingleSlot'>,
    singleSlotStoreSlot: TOIMStoreSlot<TOIMSingleSlotStore<TSlot>, TSlot>,
): TSlot {
    const db = useOIMDB();
    const store = useMemo(() => {
        const snapshotVersion = new OIMSnapshotVersion();
        let subscribedSlot: TSlot | undefined = undefined;
        return {
            snapshotVersion,
            subscribe: (onStoreChange: () => void): TOIMDisposer => {
                const holdingSlot = singleSlotService.holdSingleSlot(singleSlotStoreSlot);
                try {
                    oimAssertOneChannel(db, holdingSlot, hookName);
                    const disposeEffect = snapshotVersion.subscribeEffect(db, [holdingSlot], [], onStoreChange);
                    subscribedSlot = holdingSlot;
                    return () => {
                        subscribedSlot = undefined;
                        disposeEffect();
                    };
                } finally {
                    holdingSlot.owner.unholdSlot(holdingSlot);
                }
            },
            getSlot: (): TSlot => subscribedSlot ?? singleSlotService.getSingleSlot(singleSlotStoreSlot),
        };
    }, [hookName, db, singleSlotService, singleSlotStoreSlot]);

    useOIMSnapshotVersion(store.snapshotVersion, store.subscribe);
    return store.getSlot();
}
