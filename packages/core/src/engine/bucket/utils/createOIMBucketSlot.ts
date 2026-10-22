import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMBucketSlotOwnerService } from '../types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';

export function createOIMBucketSlot<TSlots, TKey>(
    key: TKey,
    owner: TOIMBucketSlotOwnerService<TSlots, TOIMSlot>,
    bucketSlotsStore: TSlots,
    storeSlot: TOIMStoreSlot<unknown, TOIMBucketSlot<TSlots>>,
): TOIMBucketSlot<TSlots, TKey> {
    return {
        effects: undefined,
        changedAtRevision: 0,
        changedAtEpoch: 0,
        effectEdges: undefined,
        holdCount: 0,
        releaseDueAfterWriteMs: -1,
        releaseDueAfterIdleMs: -1,
        releaseDueAfterUnholdMs: -1,
        slotFlags: OIM_SLOT_FLAG_EMPTY,
        columnSlotStore: undefined,
        storeSlot,
        owner,
        key,
        indexKeys: undefined,
        bucketSlotsStore,
        commands: undefined,
        isWholeListRecorded: false,
        commandsStartedAtRevision: 0,
        commandsStartedAtEpoch: 0,
        wasEmptyBeforeChange: undefined,
        isChangedAgainInSubframe: false,
    };
}
