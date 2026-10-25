import type { IOIMSlotContentService } from '../../engine/slot/interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../../engine/slot/interfaces/IOIMKeyedSlotCreator';
import type { IOIMSingleSlotCreator } from '../../engine/slot/interfaces/IOIMSingleSlotCreator';
import type { IOIMSlotOwner } from '../../engine/slot/interfaces/IOIMSlotOwner';
import type { IOIMSlotContentWriter } from '../../engine/slot/interfaces/IOIMSlotContentWriter';
import type { TOIMStoreKey } from '../../engine/store/types/TOIMStoreKey';
import type { IOIMBucketCommands } from '../../engine/bucket/commands/interfaces/IOIMBucketCommands';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketContentSlot } from '../../engine/bucket/types/TOIMBucketContentSlot';
import type { TOIMBucketSlotOwnerService } from '../../engine/bucket/types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMSlotEditable } from '../../engine/slot/types/TOIMSlotEditable';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { TOIMSlotContentBucketServiceOptions } from './types/TOIMSlotContentBucketServiceOptions';
import { createOIMSingleBucketSlot } from '../../engine/bucket/utils/createOIMSingleBucketSlot';
import { OIMNoBucketCommands } from '../../engine/bucket/commands/OIMNoBucketCommands';
import type { OIMChannelQueue } from '../../engine/channel/OIMChannelQueue';
import { OIM_NOTHING_WAS_REMOVED } from '../../engine/bucket/constants/OIM_NOTHING_WAS_REMOVED';
import { OIM_REMOVED_WITHOUT_A_POSITION } from '../../engine/bucket/constants/OIM_REMOVED_WITHOUT_A_POSITION';
import { createOIMBucketSlot } from '../../engine/bucket/utils/createOIMBucketSlot';
import { oimGetChannelQueueAtDepth } from '../../engine/channel/utils/oimGetChannelQueueAtDepth';
import { oimIsSlotEmpty } from '../../engine/slot/utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../../engine/slot/utils/oimIsSlotReleased';
import { oimUnholdSlotIfAlive } from '../../engine/slot/utils/oimUnholdSlotIfAlive';
import { oimGetChannelSlot } from '../../engine/slot/utils/oimGetChannelSlot';

export abstract class OIMSlotContentBucketService<
    TBucketMemberSlot extends TOIMSlot, TSlots, TKey extends NonNullable<unknown> = TOIMStoreKey,
>
implements IOIMSlotContentService<TOIMBucketContentSlot<TSlots>, TOIMBucketSlotOwnerService<TSlots>>,
    IOIMKeyedSlotCreator<TKey, TOIMBucketSlot<TSlots, TKey>>, IOIMSingleSlotCreator<TOIMBucketContentSlot<TSlots>>,
    IOIMSlotContentWriter<TOIMBucketContentSlot<TSlots>, readonly TBucketMemberSlot[]> {
    protected readonly bucketCommands: IOIMBucketCommands;

    protected constructor(options: TOIMSlotContentBucketServiceOptions) {
        this.bucketCommands = options.bucketCommands ?? OIMNoBucketCommands.INSTANCE;
    }

    protected abstract createBucketMemberSlotsStore(): TSlots;

    protected abstract addSlot(bucketSlot: TOIMBucketContentSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): boolean;

    protected abstract removeSlot(bucketSlot: TOIMBucketContentSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): number;

    protected abstract removeSlots(
        bucketSlot: TOIMBucketContentSlot<TSlots>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void;

    protected abstract reconcileSlots(
        bucketSlot: TOIMBucketContentSlot<TSlots>, bucketMemberSlots: readonly TBucketMemberSlot[],
        arrivedChannelQueue: OIMChannelQueue<TOIMSlot>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void;

    protected abstract drainSlots(bucketSlot: TOIMBucketContentSlot<TSlots>, departedChannelQueue: OIMChannelQueue<TOIMSlot>): void;

    public abstract hasBucketMemberSlot(bucketSlot: TOIMBucketContentSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): boolean;

    public abstract getBucketMemberSlotCount(bucketSlot: TOIMBucketContentSlot<TSlots>): number;

    public abstract getBucketMemberSlots(bucketSlot: TOIMBucketContentSlot<TSlots>): Iterable<TBucketMemberSlot>;

    public getBucketMemberSlotsMissingFrom(
        bucketSlot: TOIMBucketContentSlot<TSlots>, bucketMemberSlots: readonly TBucketMemberSlot[],
    ): TBucketMemberSlot[] {
        const givenBucketMemberSlots = new Set<TBucketMemberSlot>(bucketMemberSlots);
        const missingBucketMemberSlots: TBucketMemberSlot[] = [];
        for (const bucketMemberSlot of this.getBucketMemberSlots(bucketSlot)) {
            if (!givenBucketMemberSlots.has(bucketMemberSlot)) missingBucketMemberSlots.push(bucketMemberSlot);
        }
        return missingBucketMemberSlots;
    }

    public createSlot(key: TKey, storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TOIMBucketSlot<TSlots, TKey> {
        return createOIMBucketSlot(
            key, slotOwner, this.createBucketMemberSlotsStore(), storeSlot as TOIMStoreSlot<unknown, TOIMBucketContentSlot<TSlots>>,
        );
    }

    public createSingleSlot(storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TOIMBucketContentSlot<TSlots> {
        return createOIMSingleBucketSlot(
            slotOwner, this.createBucketMemberSlotsStore(), storeSlot as TOIMStoreSlot<unknown, TOIMBucketContentSlot<TSlots>>,
        );
    }

    public isSlotEmpty(bucketSlot: TOIMBucketContentSlot<TSlots>): boolean {
        return this.getBucketMemberSlotCount(bucketSlot) === 0;
    }

    public hasReference(): boolean {
        return false;
    }

    public releaseSlotContent(
        bucketSlot: TOIMBucketContentSlot<TSlots>, slotOwnerService: TOIMBucketSlotOwnerService<TSlots>,
    ): void {
        if (this.getBucketMemberSlotCount(bucketSlot) === 0) return;
        slotOwnerService.assertWritable(bucketSlot);
        this.unholdAllBucketMemberSlots(bucketSlot);
        slotOwnerService.dispatchContentChange(bucketSlot);
    }

    public markContentChanged(bucketSlot: TOIMBucketContentSlot<TSlots>): void {
        (bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>).assertWritable(bucketSlot);
        this.markBucketSlotChanged(bucketSlot);
    }

    public markBucketColumnsChanged(
        bucketSlot: TOIMBucketContentSlot<TSlots>,
        patch: object | undefined, changedColumns: readonly string[] | undefined,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        if (!slotOwnerService.hasColumnSlots(bucketSlot)) return;
        slotOwnerService.columnSlotOwner.markColumnsChanged(bucketSlot, patch, changedColumns, oimGetChannelSlot(bucketSlot));
    }

    public addBucketMemberSlot(
        bucketSlot: TOIMBucketContentSlot<TSlots>,
        bucketMemberSlot: TBucketMemberSlot,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        this.assertBucketMemberSlotNotReleased(bucketMemberSlot);
        if (this.addBucketMemberSlotUnannounced(bucketSlot, bucketMemberSlot)) this.markBucketSlotChanged(bucketSlot);
    }

    public removeBucketMemberSlot(
        bucketSlot: TOIMBucketContentSlot<TSlots>,
        bucketMemberSlot: TBucketMemberSlot,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        const at = this.removeSlot(bucketSlot, bucketMemberSlot);
        if (at === OIM_NOTHING_WAS_REMOVED) return;
        this.letGoOfRemovedBucketMemberSlot(bucketSlot, bucketMemberSlot, at);
        this.markBucketSlotChanged(bucketSlot);
    }

    public addBucketMemberSlots(
        bucketSlot: TOIMBucketContentSlot<TSlots>,
        bucketMemberSlots: readonly TBucketMemberSlot[],
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        this.assertBucketMemberSlotsNotReleased(bucketMemberSlots);
        let isAnyAdded = false;
        for (let i = 0; i < bucketMemberSlots.length; i++) {
            if (this.addBucketMemberSlotUnannounced(bucketSlot, bucketMemberSlots[i])) isAnyAdded = true;
        }
        if (isAnyAdded) this.markBucketSlotChanged(bucketSlot);
    }

    public removeBucketMemberSlots(
        bucketSlot: TOIMBucketContentSlot<TSlots>,
        bucketMemberSlots: readonly TBucketMemberSlot[],
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        const storeSlotEditable = bucketSlot.storeSlot as TOIMSlotEditable<TOIMStoreSlot>;
        const writeDepth = storeSlotEditable.writeDepth++;
        const removedChannelQueue = oimGetChannelQueueAtDepth(storeSlotEditable.departedBucketMemberSlotChannelQueues ??= [], writeDepth);
        const removedAtChannelQueue = oimGetChannelQueueAtDepth(storeSlotEditable.removedAtChannelQueues ??= [], writeDepth);
        try {
            this.removeSlots(bucketSlot, bucketMemberSlots, removedChannelQueue, removedAtChannelQueue);
            const removedCount = removedChannelQueue.getEntryCount();
            for (let i = 0; i < removedCount; i++) {
                this.letGoOfRemovedBucketMemberSlot(bucketSlot, removedChannelQueue.getEntryAt(i), removedAtChannelQueue.getEntryAt(i));
            }
            if (removedCount !== 0) this.markBucketSlotChanged(bucketSlot);
        } finally {
            removedChannelQueue.keepFirstEntries(0);
            removedAtChannelQueue.keepFirstEntries(0);
            storeSlotEditable.writeDepth = writeDepth;
        }
    }

    public insertSlotContent(
        bucketSlot: TOIMBucketContentSlot<TSlots>, bucketMemberSlots: readonly TBucketMemberSlot[],
        changedBucketSlots?: TOIMBucketContentSlot<TSlots>[],
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.fileSlot(bucketSlot);
        let isWritten: boolean;
        try {
            isWritten = this.writeSlotContent(bucketSlot, bucketMemberSlots);
        } catch (refusal) {
            slotOwnerService.releaseSlotIfUnheld(bucketSlot);
            throw refusal;
        }
        if (!isWritten) slotOwnerService.releaseSlotIfUnheld(bucketSlot);
        else if (changedBucketSlots !== undefined) changedBucketSlots.push(bucketSlot);
    }

    public writeSlotContent(
        bucketSlot: TOIMBucketContentSlot<TSlots>,
        bucketMemberSlots: readonly TBucketMemberSlot[],
    ): boolean {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        if (!this.reconcileBucketMemberSlots(bucketSlot, bucketMemberSlots)) return false;
        this.markBucketSlotChanged(bucketSlot);
        return true;
    }

    public clearSlotContent(bucketSlot: TOIMBucketContentSlot<TSlots>): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        if (this.drainBucketMemberSlots(bucketSlot)) this.markBucketSlotChanged(bucketSlot);
        else slotOwnerService.releaseSlotIfUnheld(bucketSlot);
    }

    public fillBucketMemberSlots(
        bucketSlot: TOIMBucketContentSlot<TSlots>,
        bucketMemberSlots: readonly TBucketMemberSlot[],
    ): void {
        if (bucketSlot.changedAtRevision !== 0) {
            throw new Error(
                'OIMSlotContentBucketService: fillBucketMemberSlots fills only a bucket nobody was told about yet, and this one '
                + 'was announced. Use addBucketMemberSlots or writeSlotContent, which tell its listeners.',
            );
        }
        this.assertBucketMemberSlotsNotReleased(bucketMemberSlots);
        for (let i = 0; i < bucketMemberSlots.length; i++) {
            const bucketMemberSlot = bucketMemberSlots[i];
            if (this.addSlot(bucketSlot, bucketMemberSlot)) bucketMemberSlot.owner.holdSlot(bucketMemberSlot);
        }
    }

    protected markBucketSlotChanged(
        bucketSlot: TOIMBucketContentSlot<TSlots>,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        const wasEmpty = oimIsSlotEmpty(bucketSlot);
        slotOwnerService.markEmptiness(bucketSlot, this.isSlotEmpty(bucketSlot));
        if (oimIsSlotReleased(bucketSlot)) return;
        slotOwnerService.writeSlotToChannelAndSettle(bucketSlot, wasEmpty);
        slotOwnerService.dispatchContentChange(bucketSlot);
        slotOwnerService.releaseSlotIfUnheldAfterListeners(bucketSlot);
    }

    protected letGoOfRemovedBucketMemberSlot(bucketSlot: TOIMBucketContentSlot<TSlots>, bucketMemberSlot: TOIMSlot, at: number): void {
        oimUnholdSlotIfAlive(bucketMemberSlot);
        if (at === OIM_REMOVED_WITHOUT_A_POSITION) this.bucketCommands.recordWholeList(bucketSlot);
        else this.bucketCommands.recordRemove(bucketSlot, at, 1, this.getBucketMemberSlotCount(bucketSlot));
    }

    protected assertBucketMemberSlotNotReleased(bucketMemberSlot: TOIMSlot): void {
        if (!oimIsSlotReleased(bucketMemberSlot)) return;
        throw new Error(
            'OIMSlotContentBucketService: an identity handed to a bucket was released — it is filed under no key '
            + 'and nothing may hold it, so a bucket keeping it would keep a slot no lookup returns. The '
            + 'bucket is left as it was. Resolve the key afresh before handing it in.',
        );
    }

    private assertBucketMemberSlotsNotReleased(bucketMemberSlots: readonly TOIMSlot[]): void {
        for (let i = 0; i < bucketMemberSlots.length; i++) this.assertBucketMemberSlotNotReleased(bucketMemberSlots[i]);
    }

    private addBucketMemberSlotUnannounced(bucketSlot: TOIMBucketContentSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): boolean {
        if (!this.addSlot(bucketSlot, bucketMemberSlot)) return false;
        bucketMemberSlot.owner.holdSlot(bucketMemberSlot);
        const bucketMemberSlotCount = this.getBucketMemberSlotCount(bucketSlot);
        this.bucketCommands.recordInsert(bucketSlot, bucketMemberSlotCount - 1, bucketMemberSlot, bucketMemberSlotCount);
        return true;
    }

    private reconcileBucketMemberSlots(
        bucketSlot: TOIMBucketContentSlot<TSlots>,
        bucketMemberSlots: readonly TBucketMemberSlot[],
    ): boolean {
        this.assertBucketMemberSlotsNotReleased(bucketMemberSlots);
        const storeSlotEditable = bucketSlot.storeSlot as TOIMSlotEditable<TOIMStoreSlot>;
        const writeDepth = storeSlotEditable.writeDepth++;
        const arrivedChannelQueue = oimGetChannelQueueAtDepth(storeSlotEditable.arrivedBucketMemberSlotChannelQueues ??= [], writeDepth);
        const departedChannelQueue = oimGetChannelQueueAtDepth(storeSlotEditable.departedBucketMemberSlotChannelQueues ??= [], writeDepth);
        try {
            this.reconcileSlots(bucketSlot, bucketMemberSlots, arrivedChannelQueue, departedChannelQueue);
            const arrivedCount = arrivedChannelQueue.getEntryCount();
            const departedCount = departedChannelQueue.getEntryCount();
            if (arrivedCount === 0 && departedCount === 0) return false;
            for (let i = 0; i < arrivedCount; i++) {
                const arrivedBucketMemberSlot = arrivedChannelQueue.getEntryAt(i);
                arrivedBucketMemberSlot.owner.holdSlot(arrivedBucketMemberSlot);
            }
            for (let i = 0; i < departedCount; i++) oimUnholdSlotIfAlive(departedChannelQueue.getEntryAt(i));
            this.bucketCommands.recordWholeList(bucketSlot);
            return true;
        } finally {
            arrivedChannelQueue.keepFirstEntries(0);
            departedChannelQueue.keepFirstEntries(0);
            storeSlotEditable.writeDepth = writeDepth;
        }
    }

    private drainBucketMemberSlots(bucketSlot: TOIMBucketContentSlot<TSlots>): boolean {
        if (this.getBucketMemberSlotCount(bucketSlot) === 0) return false;
        if (this.unholdAllBucketMemberSlots(bucketSlot) === 0) return false;
        this.bucketCommands.recordWholeList(bucketSlot);
        return true;
    }

    private unholdAllBucketMemberSlots(bucketSlot: TOIMBucketContentSlot<TSlots>): number {
        const storeSlotEditable = bucketSlot.storeSlot as TOIMSlotEditable<TOIMStoreSlot>;
        const writeDepth = storeSlotEditable.writeDepth++;
        const departedChannelQueue = oimGetChannelQueueAtDepth(storeSlotEditable.departedBucketMemberSlotChannelQueues ??= [], writeDepth);
        try {
            this.drainSlots(bucketSlot, departedChannelQueue);
            const drainedCount = departedChannelQueue.getEntryCount();
            for (let i = 0; i < drainedCount; i++) oimUnholdSlotIfAlive(departedChannelQueue.getEntryAt(i));
            return drainedCount;
        } finally {
            departedChannelQueue.keepFirstEntries(0);
            storeSlotEditable.writeDepth = writeDepth;
        }
    }
}
