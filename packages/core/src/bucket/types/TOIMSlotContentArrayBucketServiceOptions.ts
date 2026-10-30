import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { IOIMBucketMemberSlotsArrayService } from '../array/interfaces/IOIMBucketMemberSlotsArrayService';
import type { TOIMSlotContentBucketServiceOptions } from './TOIMSlotContentBucketServiceOptions';

export type TOIMSlotContentArrayBucketServiceOptions<TBucketMemberSlot extends TOIMSlot = TOIMSlot> = TOIMSlotContentBucketServiceOptions & {
    bucketMemberSlotsArrayService?: IOIMBucketMemberSlotsArrayService<TBucketMemberSlot> | undefined;
};
