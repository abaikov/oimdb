import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMOrderedListCommand } from '../commands/types/TOIMOrderedListCommand';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';

export type TOIMBucketContentSlot<TSlots = unknown> = TOIMSlot & {
    readonly owner: IOIMSlotOwner;
    readonly storeSlot: TOIMStoreSlot<unknown, TOIMBucketContentSlot<TSlots>>;
    readonly bucketSlotsStore: TSlots;
    readonly commands: readonly TOIMOrderedListCommand[] | undefined;
    readonly isWholeListRecorded: boolean;
    readonly commandsStartedAtRevision: number;
    readonly commandsStartedAtEpoch: number;
};
