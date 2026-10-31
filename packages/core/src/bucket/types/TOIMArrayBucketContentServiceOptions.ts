import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { IOIMBucketMemberSlotsArrayService } from '../array/interfaces/IOIMBucketMemberSlotsArrayService';
import type { TOIMBucketContentServiceOptions } from './TOIMBucketContentServiceOptions';

export type TOIMArrayBucketContentServiceOptions<TBucketMemberSlot extends TOIMSlot = TOIMSlot> = TOIMBucketContentServiceOptions & {
    bucketMemberSlotsArrayService?: IOIMBucketMemberSlotsArrayService<TBucketMemberSlot> | undefined;
};
