import type { IOIMBucketCommands } from './interfaces/IOIMBucketCommands';

export class OIMBucketCommandsNone implements IOIMBucketCommands {
    public static readonly INSTANCE = new OIMBucketCommandsNone();

    public recordInsert(): void {
        return;
    }

    public recordRemove(): void {
        return;
    }

    public recordMove(): void {
        return;
    }

    public recordWholeList(): void {
        return;
    }
}
