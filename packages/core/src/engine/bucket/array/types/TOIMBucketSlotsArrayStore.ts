import type { TOIMSlot } from '../../../slot/types/TOIMSlot';

export type TOIMBucketSlotsArrayStore<TBucketMemberSlot extends TOIMSlot = TOIMSlot> = {
    bucketMemberSlots: TBucketMemberSlot[];
};
