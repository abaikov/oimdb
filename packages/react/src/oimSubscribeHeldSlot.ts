import type { IOIMChannelMap, TOIMComputedContentSlot, TOIMDisposer, TOIMSlot } from '@oimdb/core';
import { oimAssertOneChannel } from './oimAssertOneChannel';
import type { OIMSnapshotVersion } from './OIMSnapshotVersion';

export function oimSubscribeHeldSlot<TSlot extends TOIMSlot>(
    db: IOIMChannelMap,
    hookName: string,
    snapshotVersion: OIMSnapshotVersion,
    holdingSlot: TSlot,
    sourcesOfSlot: (slot: TSlot) => readonly [readonly TOIMSlot[], readonly TOIMComputedContentSlot[]],
    onStoreChange: () => void,
): TOIMDisposer {
    try {
        oimAssertOneChannel(db, holdingSlot, hookName);
        const [sourceSlots, sourceComputeds] = sourcesOfSlot(holdingSlot);
        return snapshotVersion.subscribeEffect(db, sourceSlots, sourceComputeds, onStoreChange);
    } finally {
        holdingSlot.owner.unholdSlot(holdingSlot);
    }
}
