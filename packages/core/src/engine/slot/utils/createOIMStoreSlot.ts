import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMStoreSlot } from '../types/TOIMStoreSlot';
import type { TOIMChannelSlot } from '../../channel/types/TOIMChannelSlot';

export function createOIMStoreSlot<TStore, TSlot extends TOIMSlot, TPatch>(
    store: TStore, channelSlot: TOIMChannelSlot, sourceStoreSlot?: TOIMStoreSlot,
): TOIMStoreSlot<TStore, TSlot, TPatch> {
    return {
        store,
        channelSlot,
        contentChangeListeners: undefined,
        contentChangeListenerReadColumnNames: undefined,
        indexKeysPositions: undefined,
        columnListenerCountsByColumnName: undefined,
        allColumnsListenerCount: 0,
        columnGroupsByKey: undefined,
        columnGroupSlotCountsByKey: undefined,
        columnReadersByColumnName: undefined,
        anyColumnSlotCount: 0,
        subframeSlotChannelQueues: undefined,
        subframePatchChannelQueues: undefined,
        subframeChangedColumnsChannelQueues: undefined,
        changedBucketSlotChannelQueue: undefined,
        arrivedBucketMemberSlotChannelQueues: undefined,
        departedBucketMemberSlotChannelQueues: undefined,
        removedAtChannelQueues: undefined,
        writeDepth: 0,
        commandsBucketSlotChannelQueue: undefined,
        sourceStoreSlot,
        keptStampedEntitySlots: undefined,
        derive: undefined,
        createSources: undefined,
        indexKeysPosition: -1,
        contentChangeListener: undefined,
        requestedKeys: undefined,
        bucketColumnNames: undefined,
        isAnyBucketColumnRead: false,
        isDisposed: false,
    };
}
