import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMBucketContentSlot } from '../types/TOIMBucketContentSlot';
import type { TOIMOrderedListCommand } from './types/TOIMOrderedListCommand';
import type { TOIMBucketCommandsCursorOptions } from './types/TOIMBucketCommandsCursorOptions';

export class OIMBucketCommandsCursor<TSlots = unknown, TBucketMemberSlot extends TOIMSlot = TOIMSlot> {
    private readonly bucketSlot: TOIMBucketContentSlot<TSlots, TBucketMemberSlot>;

    private isFirstTake = true;

    private takenAtRevision = -1;

    private takenAtEpoch = -1;

    private takenCommandCount = 0;

    public constructor(options: TOIMBucketCommandsCursorOptions<TSlots, TBucketMemberSlot>) {
        this.bucketSlot = options.bucketSlot;
    }

    public takeBucketCommands(): readonly TOIMOrderedListCommand[] {
        const bucketSlot = this.bucketSlot;
        const commands = bucketSlot.commands;
        const isSameScript = !this.isFirstTake
            && bucketSlot.commandsStartedAtRevision === this.takenAtRevision && bucketSlot.commandsStartedAtEpoch === this.takenAtEpoch;
        const takenCommandCount = isSameScript ? this.takenCommandCount : 0;
        const isWholeListOwed = this.isFirstTake || bucketSlot.isWholeListRecorded
            || commands === undefined || commands.length <= takenCommandCount;
        this.isFirstTake = false;
        this.takenAtRevision = bucketSlot.commandsStartedAtRevision;
        this.takenAtEpoch = bucketSlot.commandsStartedAtEpoch;
        this.takenCommandCount = commands === undefined ? 0 : commands.length;
        if (isWholeListOwed) return [{ type: 'reset', slots: Array.from(bucketSlot.getBucketMemberSlots()) }];
        return takenCommandCount === 0 ? commands : commands.slice(takenCommandCount);
    }
}
