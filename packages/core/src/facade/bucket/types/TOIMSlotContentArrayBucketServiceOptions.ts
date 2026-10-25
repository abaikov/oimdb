import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';
import type { IOIMBucketMemberSlotsArrayService } from '../../../engine/bucket/array/interfaces/IOIMBucketMemberSlotsArrayService';
import type { TOIMSlotContentBucketServiceOptions } from './TOIMSlotContentBucketServiceOptions';

export type TOIMSlotContentArrayBucketServiceOptions<TBucketMemberSlot extends TOIMSlot = TOIMSlot> = TOIMSlotContentBucketServiceOptions & {
    bucketMemberSlotsArrayService?: IOIMBucketMemberSlotsArrayService<TBucketMemberSlot> | undefined;
};
