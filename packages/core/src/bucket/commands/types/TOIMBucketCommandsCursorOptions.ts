import type { TOIMSlot } from '../../../slot/types/TOIMSlot';
import type { TOIMBucketContentSlot } from '../../types/TOIMBucketContentSlot';

export type TOIMBucketCommandsCursorOptions<TSlots = unknown, TBucketMemberSlot extends TOIMSlot = TOIMSlot> = {
    bucketSlot: TOIMBucketContentSlot<TSlots, TBucketMemberSlot>;
};
