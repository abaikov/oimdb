import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export type TOIMBucketSlotsSetStore<TBucketMemberSlot extends TOIMSlot = TOIMSlot> =
    Set<TBucketMemberSlot>;
