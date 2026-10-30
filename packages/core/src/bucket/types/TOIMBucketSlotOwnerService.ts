import type { OIMSlotOwnerService } from '../../slot/OIMSlotOwnerService';
import type { OIMPushColumnSlotOwner } from '../../column/OIMPushColumnSlotOwner';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMBucketContentSlot } from './TOIMBucketContentSlot';

export type TOIMBucketSlotOwnerService<
    TSlots, TBucketMemberSlot extends TOIMSlot = TOIMSlot,
    TBucketSlot extends TOIMBucketContentSlot<TSlots> = TOIMBucketContentSlot<TSlots>, TStore = unknown,
> = OIMSlotOwnerService<TBucketSlot, TStore, string, TOIMColumnSlot, OIMPushColumnSlotOwner, readonly TBucketMemberSlot[]>;
