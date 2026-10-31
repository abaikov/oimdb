import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { IOIMSlotContentService } from '../slot/interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../slot/interfaces/IOIMKeyedSlotCreator';
import type { IOIMSingleSlotCreator } from '../slot/interfaces/IOIMSingleSlotCreator';
import type { IOIMSlotContentWriter } from '../slot/interfaces/IOIMSlotContentWriter';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { IOIMBucketCommands } from './commands/interfaces/IOIMBucketCommands';
import type { TOIMBucketSlot } from './types/TOIMBucketSlot';
import type { TOIMBucketContentSlot } from './types/TOIMBucketContentSlot';
import type { TOIMBucketSlotOwnerService } from './types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMBucketContentServiceOptions } from './types/TOIMBucketContentServiceOptions';
import { createOIMBucketContentSlot } from './utils/createOIMBucketContentSlot';
import { OIMNoBucketCommands } from './commands/OIMNoBucketCommands';
import type { OIMChannelQueue } from '../channel/OIMChannelQueue';
import { OIM_NOTHING_WAS_REMOVED } from './constants/OIM_NOTHING_WAS_REMOVED';
import { OIM_REMOVED_WITHOUT_A_POSITION } from './constants/OIM_REMOVED_WITHOUT_A_POSITION';
import { createOIMBucketSlot } from './utils/createOIMBucketSlot';
import { oimGetChannelQueueAtDepth } from '../channel/utils/oimGetChannelQueueAtDepth';
import { oimIsSlotEmpty } from '../slot/utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../slot/utils/oimIsSlotReleased';
import { oimUnholdSlotIfAlive } from '../slot/utils/oimUnholdSlotIfAlive';
import { oimGetChannelSlot } from '../slot/utils/oimGetChannelSlot';
import { oimAssertSlotUnheld } from '../slot/utils/oimAssertSlotUnheld';

export abstract class OIMBucketContentService<
    TBucketMemberSlot extends TOIMSlot, TSlots, TKey extends NonNullable<unknown> = TOIMStoreKey,
>
implements IOIMSlotContentService<TOIMBucketContentSlot<TSlots>>,
    IOIMKeyedSlotCreator<TKey, TOIMBucketSlot<TSlots, TKey>>, IOIMSingleSlotCreator<TOIMBucketContentSlot<TSlots>>,
    IOIMSlotContentWriter<TOIMBucketContentSlot<TSlots>, readonly TBucketMemberSlot[]> {
    protected readonly bucketCommands: IOIMBucketCommands;

    protected constructor(options: TOIMBucketContentServiceOptions) {
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

    /** @deprecated Use `slot.hasBucketMemberSlot(…)`; removed in 5.0. */
    public abstract hasBucketMemberSlot(bucketSlot: TOIMBucketContentSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): boolean;

    /** @deprecated Use `slot.getBucketMemberSlotCount(…)`; removed in 5.0. */
    public abstract getBucketMemberSlotCount(bucketSlot: TOIMBucketContentSlot<TSlots>): number;

    /** @deprecated Use `slot.getBucketMemberSlots(…)`; removed in 5.0. */
    public abstract getBucketMemberSlots(bucketSlot: TOIMBucketContentSlot<TSlots>): Iterable<TBucketMemberSlot>;

    /** @deprecated Use `slot.getBucketMemberSlotsMissingFrom(…)`; removed in 5.0. */
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
        return createOIMBucketContentSlot(
            slotOwner, this.createBucketMemberSlotsStore(), storeSlot as TOIMStoreSlot<unknown, TOIMBucketContentSlot<TSlots>>,
        );
    }

    public isSlotEmpty(bucketSlot: TOIMBucketContentSlot<TSlots>): boolean {
        return this.getBucketMemberSlotCount(bucketSlot) === 0;
    }

    public hasReference(): boolean {
        return false;
    }

    public releaseSlotContent(bucketSlot: TOIMBucketContentSlot<TSlots>): void {
        oimAssertSlotUnheld(bucketSlot);
        this.unholdAllBucketMemberSlots(bucketSlot);
    }

    /** @deprecated Use `slot.markContentChanged(…)`; removed in 5.0. */
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

    /** @deprecated Use `slot.addBucketMemberSlot(…)`; removed in 5.0. */
    public addBucketMemberSlot(
        bucketSlot: TOIMBucketContentSlot<TSlots>,
        bucketMemberSlot: TBucketMemberSlot,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        this.assertBucketMemberSlotNotReleased(bucketMemberSlot);
        if (this.addBucketMemberSlotUnannounced(bucketSlot, bucketMemberSlot)) this.markBucketSlotChanged(bucketSlot);
    }

    /** @deprecated Use `slot.removeBucketMemberSlot(…)`; removed in 5.0. */
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

    /** @deprecated Use `slot.addBucketMemberSlots(…)`; removed in 5.0. */
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

    /** @deprecated Use `slot.removeBucketMemberSlots(…)`; removed in 5.0. */
    public removeBucketMemberSlots(
        bucketSlot: TOIMBucketContentSlot<TSlots>,
        bucketMemberSlots: readonly TBucketMemberSlot[],
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        const editableStoreSlot = bucketSlot.storeSlot as TOIMEditable<TOIMStoreSlot>;
        const writeDepth = editableStoreSlot.writeDepth++;
        const removedChannelQueue = oimGetChannelQueueAtDepth(editableStoreSlot.departedBucketMemberSlotChannelQueues ??= [], writeDepth);
        const removedAtChannelQueue = oimGetChannelQueueAtDepth(editableStoreSlot.removedAtChannelQueues ??= [], writeDepth);
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
            editableStoreSlot.writeDepth = writeDepth;
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

    /** @deprecated Use `slot.writeSlotContent(…)`; removed in 5.0. */
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

    /** @deprecated Use `slot.clearSlotContent(…)`; removed in 5.0. */
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
                'OIMBucketContentService: fillBucketMemberSlots fills only a bucket nobody was told about yet, and this one '
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
            'OIMBucketContentService: an identity handed to a bucket was released — it is filed under no key '
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
        const editableStoreSlot = bucketSlot.storeSlot as TOIMEditable<TOIMStoreSlot>;
        const writeDepth = editableStoreSlot.writeDepth++;
        const arrivedChannelQueue = oimGetChannelQueueAtDepth(editableStoreSlot.arrivedBucketMemberSlotChannelQueues ??= [], writeDepth);
        const departedChannelQueue = oimGetChannelQueueAtDepth(editableStoreSlot.departedBucketMemberSlotChannelQueues ??= [], writeDepth);
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
            editableStoreSlot.writeDepth = writeDepth;
        }
    }

    private drainBucketMemberSlots(bucketSlot: TOIMBucketContentSlot<TSlots>): boolean {
        if (this.getBucketMemberSlotCount(bucketSlot) === 0) return false;
        if (this.unholdAllBucketMemberSlots(bucketSlot) === 0) return false;
        this.bucketCommands.recordWholeList(bucketSlot);
        return true;
    }

    private unholdAllBucketMemberSlots(bucketSlot: TOIMBucketContentSlot<TSlots>): number {
        const editableStoreSlot = bucketSlot.storeSlot as TOIMEditable<TOIMStoreSlot>;
        const writeDepth = editableStoreSlot.writeDepth++;
        const departedChannelQueue = oimGetChannelQueueAtDepth(editableStoreSlot.departedBucketMemberSlotChannelQueues ??= [], writeDepth);
        try {
            this.drainSlots(bucketSlot, departedChannelQueue);
            const drainedCount = departedChannelQueue.getEntryCount();
            for (let i = 0; i < drainedCount; i++) oimUnholdSlotIfAlive(departedChannelQueue.getEntryAt(i));
            return drainedCount;
        } finally {
            departedChannelQueue.keepFirstEntries(0);
            editableStoreSlot.writeDepth = writeDepth;
        }
    }
}
