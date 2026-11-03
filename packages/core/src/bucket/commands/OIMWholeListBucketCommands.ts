import type { IOIMBucketCommands } from './interfaces/IOIMBucketCommands';
import type { TOIMBucketContentSlot } from '../types/TOIMBucketContentSlot';

export class OIMWholeListBucketCommands implements IOIMBucketCommands {
    private readonly bucketCommands: IOIMBucketCommands;

    public constructor(bucketCommands: IOIMBucketCommands) {
        this.bucketCommands = bucketCommands;
    }

    public recordInsert(bucketSlot: TOIMBucketContentSlot<unknown>): void {
        this.bucketCommands.recordWholeList(bucketSlot);
    }

    public recordRemove(bucketSlot: TOIMBucketContentSlot<unknown>): void {
        this.bucketCommands.recordWholeList(bucketSlot);
    }

    public recordMove(bucketSlot: TOIMBucketContentSlot<unknown>): void {
        this.bucketCommands.recordWholeList(bucketSlot);
    }

    public recordWholeList(bucketSlot: TOIMBucketContentSlot<unknown>): void {
        this.bucketCommands.recordWholeList(bucketSlot);
    }
}
