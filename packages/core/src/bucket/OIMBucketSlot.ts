import { OIM_ACTIVE_SOURCE_TRACKER } from '../computed/constants/OIM_ACTIVE_SOURCE_TRACKER';
import { OIMSlot } from '../slot/OIMSlot';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMOrderedListCommand } from './commands/types/TOIMOrderedListCommand';
import type { TOIMBucketContentSlot } from './types/TOIMBucketContentSlot';
import type { TOIMBucketSlotOwnerService } from './types/TOIMBucketSlotOwnerService';
import type { OIMBucketContentService } from './OIMBucketContentService';

export class OIMBucketSlot<
    TSlots = unknown, TKey extends NonNullable<unknown> = NonNullable<unknown>,
    TBucketMemberSlot extends TOIMSlot = TSlots extends Set<infer TSetMember extends TOIMSlot> ? TSetMember
        : TSlots extends { readonly bucketMemberSlots: readonly (infer TArrayMember extends TOIMSlot)[] } ? TArrayMember : TOIMSlot,
> extends OIMSlot {
    declare public storeSlot: TOIMStoreSlot<unknown, TOIMBucketContentSlot<TSlots>>;

    public key: TKey;

    public indexKeys: unknown[] | undefined;

    public bucketSlotsStore: TSlots;

    public commands: readonly TOIMOrderedListCommand[] | undefined;

    public isWholeListRecorded: boolean;

    public commandsStartedAtRevision: number;

    public commandsStartedAtEpoch: number;

    public constructor(key: TKey, owner: IOIMSlotOwner, bucketSlotsStore: TSlots, storeSlot: TOIMStoreSlot<unknown, TOIMBucketContentSlot<TSlots>>) {
        super(owner, storeSlot);
        this.key = key;
        this.indexKeys = undefined;
        this.bucketSlotsStore = bucketSlotsStore;
        this.commands = undefined;
        this.isWholeListRecorded = false;
        this.commandsStartedAtRevision = 0;
        this.commandsStartedAtEpoch = 0;
    }

    public getBucketMemberSlots(): Iterable<TBucketMemberSlot> {
        OIM_ACTIVE_SOURCE_TRACKER.sourceTracker?.trackSourceSlot(this);
        return this.bucketContentService().getBucketMemberSlots(this.bucketContentSlot());
    }

    public getBucketMemberSlotCount(): number {
        OIM_ACTIVE_SOURCE_TRACKER.sourceTracker?.trackSourceSlot(this);
        return this.bucketContentService().getBucketMemberSlotCount(this.bucketContentSlot());
    }

    public hasBucketMemberSlot(bucketMemberSlot: TBucketMemberSlot): boolean {
        OIM_ACTIVE_SOURCE_TRACKER.sourceTracker?.trackSourceSlot(this);
        return this.bucketContentService().hasBucketMemberSlot(this.bucketContentSlot(), bucketMemberSlot);
    }

    public getBucketMemberSlotsMissingFrom(bucketMemberSlots: readonly TBucketMemberSlot[]): TBucketMemberSlot[] {
        OIM_ACTIVE_SOURCE_TRACKER.sourceTracker?.trackSourceSlot(this);
        return this.bucketContentService().getBucketMemberSlotsMissingFrom(this.bucketContentSlot(), bucketMemberSlots);
    }

    public writeSlotContent(bucketMemberSlots: readonly TBucketMemberSlot[]): boolean {
        return this.bucketContentService().writeSlotContent(this.bucketContentSlot(), bucketMemberSlots);
    }

    public addBucketMemberSlot(bucketMemberSlot: TBucketMemberSlot): void {
        this.bucketContentService().addBucketMemberSlot(this.bucketContentSlot(), bucketMemberSlot);
    }

    public removeBucketMemberSlot(bucketMemberSlot: TBucketMemberSlot): void {
        this.bucketContentService().removeBucketMemberSlot(this.bucketContentSlot(), bucketMemberSlot);
    }

    public addBucketMemberSlots(bucketMemberSlots: readonly TBucketMemberSlot[]): void {
        this.bucketContentService().addBucketMemberSlots(this.bucketContentSlot(), bucketMemberSlots);
    }

    public removeBucketMemberSlots(bucketMemberSlots: readonly TBucketMemberSlot[]): void {
        this.bucketContentService().removeBucketMemberSlots(this.bucketContentSlot(), bucketMemberSlots);
    }

    public clearSlotContent(): void {
        this.bucketContentService().clearSlotContent(this.bucketContentSlot());
    }

    public markContentChanged(): void {
        this.bucketContentService().markContentChanged(this.bucketContentSlot());
    }

    private bucketContentSlot(): TOIMBucketContentSlot<TSlots> {
        return this as unknown as TOIMBucketContentSlot<TSlots>;
    }

    private bucketContentService(): OIMBucketContentService<TBucketMemberSlot, TSlots> {
        return (this.owner as TOIMBucketSlotOwnerService<TSlots>).slotContentService as unknown as OIMBucketContentService<TBucketMemberSlot, TSlots>;
    }
}
