import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMStoreSlot } from '../types/TOIMStoreSlot';
import type { TOIMChannelSlot } from '../../channel/types/TOIMChannelSlot';

export function createOIMStoreSlot<TStore, TSlot extends TOIMSlot, TPatch, TSlotService>(
    store: TStore, channelSlot: TOIMChannelSlot, slotService: TSlotService, sourceStoreSlot?: TOIMStoreSlot,
): TOIMStoreSlot<TStore, TSlot, TPatch, TSlotService> {
    return {
        store,
        slotService,
        channelSlot,
        contentChangeListeners: undefined,
        contentChangeListenerReadColumns: undefined,
        slotContentChangeListenerReadColumns: undefined,
        indexKeysPositions: undefined,
        columnListenerCountsByColumnName: undefined,
        allColumnsListenerCount: 0,
        batchDepth: 0,
        batchSlotChannelQueue: undefined,
        batchPatchChannelQueue: undefined,
        batchChangedColumnsChannelQueue: undefined,
        arrivedBucketMemberSlotChannelQueues: undefined,
        departedBucketMemberSlotChannelQueues: undefined,
        removedAtChannelQueues: undefined,
        writeDepth: 0,
        commandsBucketSlotChannelQueue: undefined,
        sourceStoreSlot,
        derive: undefined,
        createSources: undefined,
        indexKeysPosition: -1,
        contentChangeListener: undefined,
        requestedKeys: undefined,
        collectionBucketSlot: undefined,
        isDisposed: false,
    };
}
