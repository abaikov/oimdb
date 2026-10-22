import type { TOIMIndexableSlot } from '../../slot/types/TOIMIndexableSlot';
import type { TOIMOrderedListCommand } from '../commands/types/TOIMOrderedListCommand';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';

export type TOIMBucketSlot<TSlots = unknown, TKey = unknown> = TOIMIndexableSlot<TKey> & {
    readonly owner: IOIMSlotOwner;
    readonly storeSlot: TOIMStoreSlot<unknown, TOIMBucketSlot<TSlots>>;
    readonly bucketSlotsStore: TSlots;
    readonly commands: readonly TOIMOrderedListCommand[] | undefined;
    readonly isWholeListRecorded: boolean;
    readonly commandsStartedAtRevision: number;
    readonly commandsStartedAtEpoch: number;
    readonly wasEmptyBeforeChange: boolean | undefined;
    readonly isChangedAgainInSubframe: boolean;
};
