import type { IOIMBucketCommands } from './interfaces/IOIMBucketCommands';

export class OIMNoBucketCommands implements IOIMBucketCommands {
    public static readonly INSTANCE = new OIMNoBucketCommands();

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
