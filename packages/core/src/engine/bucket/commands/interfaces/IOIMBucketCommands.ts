import type { TOIMBucketContentSlot } from '../../types/TOIMBucketContentSlot';
import type { TOIMSlot } from '../../../slot/types/TOIMSlot';

export interface IOIMBucketCommands {
    recordInsert(bucketSlot: TOIMBucketContentSlot<unknown>, index: number, bucketMemberSlot: TOIMSlot, bucketMemberSlotCount: number): void;
    recordRemove(bucketSlot: TOIMBucketContentSlot<unknown>, index: number, count: number, bucketMemberSlotCount: number): void;
    recordMove(bucketSlot: TOIMBucketContentSlot<unknown>, from: number, to: number, bucketMemberSlotCount: number): void;
    recordWholeList(bucketSlot: TOIMBucketContentSlot<unknown>): void;
}
