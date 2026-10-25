import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMBucketContentSlot } from '../types/TOIMBucketContentSlot';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';

export function createOIMBucketSlot<TSlots, TKey extends NonNullable<unknown>>(
    key: TKey,
    owner: IOIMSlotOwner,
    bucketSlotsStore: TSlots,
    storeSlot: TOIMStoreSlot<unknown, TOIMBucketContentSlot<TSlots>>,
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
    };
}
