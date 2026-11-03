import type { IOIMChannelMap, TOIMComputedContentSlot, TOIMDisposer, TOIMSlot } from '@oimdb/core';
import { assertOIMOneChannel } from './assertOIMOneChannel';
import type { OIMSnapshotVersion } from './OIMSnapshotVersion';

export function subscribeOIMHeldSlot<TSlot extends TOIMSlot>(
    channelMap: IOIMChannelMap,
    hookName: string,
    snapshotVersion: OIMSnapshotVersion,
    holdingSlot: TSlot,
    sourcesOfSlot: (slot: TSlot) => readonly [readonly TOIMSlot[], readonly TOIMComputedContentSlot[]],
    onStoreChange: () => void,
): TOIMDisposer {
    try {
        assertOIMOneChannel(channelMap, holdingSlot, hookName);
        const [sourceSlots, sourceComputeds] = sourcesOfSlot(holdingSlot);
        return snapshotVersion.subscribeEffect(channelMap, onStoreChange, sourceSlots, sourceComputeds);
    } finally {
        holdingSlot.owner.unholdSlot(holdingSlot);
    }
}
