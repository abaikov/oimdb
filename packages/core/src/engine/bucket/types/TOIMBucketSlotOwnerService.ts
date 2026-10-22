import type { OIMSlotOwnerService } from '../../slot/OIMSlotOwnerService';
import type { OIMColumnOwnerPushDriven } from '../../column/OIMColumnOwnerPushDriven';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMBucketSlot } from './TOIMBucketSlot';

export type TOIMBucketSlotOwnerService<TSlots, TBucketMemberSlot extends TOIMSlot = TOIMSlot, TKey = unknown, TStore = unknown> =
    OIMSlotOwnerService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore, string, TOIMColumnSlot, OIMColumnOwnerPushDriven, readonly TBucketMemberSlot[]>;
