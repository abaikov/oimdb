import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMOrderedListCommand } from '../commands/types/TOIMOrderedListCommand';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';

export type TOIMBucketContentSlot<
    TSlots = unknown,
    TBucketMemberSlot extends TOIMSlot = TSlots extends ReadonlySet<infer TSetMember extends TOIMSlot> ? TSetMember
        : TSlots extends { readonly bucketMemberSlots: readonly (infer TArrayMember extends TOIMSlot)[] } ? TArrayMember : TOIMSlot,
> = TOIMSlot & {
    readonly owner: IOIMSlotOwner;
    readonly storeSlot: TOIMStoreSlot<unknown, TOIMBucketContentSlot<TSlots>>;
    readonly commands: readonly TOIMOrderedListCommand[] | undefined;
    readonly isWholeListRecorded: boolean;
    readonly commandsStartedAtRevision: number;
    readonly commandsStartedAtEpoch: number;
    getBucketMemberSlots(): Iterable<TBucketMemberSlot>;
    getBucketMemberSlotCount(): number;
    hasBucketMemberSlot(bucketMemberSlot: TBucketMemberSlot): boolean;
    getBucketMemberSlotsMissingFrom(bucketMemberSlots: readonly TBucketMemberSlot[]): TBucketMemberSlot[];
    writeSlotContent(bucketMemberSlots: readonly TBucketMemberSlot[]): boolean;
    addBucketMemberSlot(bucketMemberSlot: TBucketMemberSlot): void;
    removeBucketMemberSlot(bucketMemberSlot: TBucketMemberSlot): void;
    addBucketMemberSlots(bucketMemberSlots: readonly TBucketMemberSlot[]): void;
    removeBucketMemberSlots(bucketMemberSlots: readonly TBucketMemberSlot[]): void;
    clearSlotContent(): void;
    markContentChanged(): void;
    holdSlot(): void;
    unholdSlot(): void;
};
