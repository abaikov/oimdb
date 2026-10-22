import type { TOIMBucketSlot } from '../../types/TOIMBucketSlot';
import type { TOIMSlot } from '../../../slot/types/TOIMSlot';

export interface IOIMBucketCommands {
    recordInsert(bucketSlot: TOIMBucketSlot<unknown>, index: number, bucketMemberSlot: TOIMSlot, bucketMemberSlotCount: number): void;
    recordRemove(bucketSlot: TOIMBucketSlot<unknown>, index: number, count: number, bucketMemberSlotCount: number): void;
    recordMove(bucketSlot: TOIMBucketSlot<unknown>, from: number, to: number, bucketMemberSlotCount: number): void;
    recordWholeList(bucketSlot: TOIMBucketSlot<unknown>): void;
}
