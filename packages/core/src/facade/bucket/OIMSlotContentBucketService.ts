import type { IOIMSlotContentStrategy } from '../../engine/slot/interfaces/IOIMSlotContentStrategy';
import type { IOIMSlotContentFlushStrategy } from '../../engine/slot/interfaces/IOIMSlotContentFlushStrategy';
import type { IOIMBucketCommands } from '../../engine/bucket/commands/interfaces/IOIMBucketCommands';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotOwnerService } from '../../engine/bucket/types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMSlotEditable } from '../../engine/slot/types/TOIMSlotEditable';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import type { TOIMSlotContentBucketServiceOptions } from './types/TOIMSlotContentBucketServiceOptions';
import type { TOIMSlotOwnerServiceOptions } from '../../engine/slot/types/TOIMSlotOwnerServiceOptions';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';
import type { OIMColumnOwnerPushDriven } from '../../engine/column/OIMColumnOwnerPushDriven';
import { OIMSlotOwnerService } from '../../engine/slot/OIMSlotOwnerService';
import { OIMBucketCommandsNone } from '../../engine/bucket/commands/OIMBucketCommandsNone';
import { OIMChannelQueue } from '../../engine/channel/OIMChannelQueue';
import { OIM_NOTHING_WAS_REMOVED } from '../../engine/bucket/constants/OIM_NOTHING_WAS_REMOVED';
import { OIM_REMOVED_WITHOUT_A_POSITION } from '../../engine/bucket/constants/OIM_REMOVED_WITHOUT_A_POSITION';
import { createOIMBucketSlot } from '../../engine/bucket/utils/createOIMBucketSlot';
import { oimGetChannelQueueAtDepth } from '../../engine/channel/utils/oimGetChannelQueueAtDepth';
import { oimIsSlotEmpty } from '../../engine/slot/utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../../engine/slot/utils/oimIsSlotReleased';
import { oimUnholdSlotIfAlive } from '../../engine/slot/utils/oimUnholdSlotIfAlive';
import { oimGetChannelSlot } from '../../engine/slot/utils/oimGetChannelSlot';
import { OIMChannelService } from '../../engine/channel/OIMChannelService';
import { OIMContentChangeDeliveryService } from '../../engine/slot/OIMContentChangeDeliveryService';

export abstract class OIMSlotContentBucketService<TBucketMemberSlot extends TOIMSlot, TSlots> {
    protected readonly bucketCommands: IOIMBucketCommands;

    private readonly slotContentStrategy:
        IOIMSlotContentStrategy<TOIMBucketSlot<TSlots>, unknown, TOIMBucketSlotOwnerService<TSlots>>
        & IOIMSlotContentFlushStrategy<TOIMBucketSlot<TSlots>, TOIMBucketSlotOwnerService<TSlots>>;

    protected constructor(options: TOIMSlotContentBucketServiceOptions) {
        this.bucketCommands = options.bucketCommands ?? OIMBucketCommandsNone.INSTANCE;
        this.slotContentStrategy = {
            createSlot: (key, storeSlot, slotOwnerService) => this.createSlot(key, storeSlot, slotOwnerService),
            isSlotEmpty: bucketSlot => this.isSlotEmpty(bucketSlot),
            hasReference: bucketSlot => this.hasReference(bucketSlot),
            releaseSlotContent: (bucketSlot, slotOwnerService) => { this.releaseSlotContent(bucketSlot, slotOwnerService); },
            onSubframeClosed: (storeSlot, slotOwnerService) => { this.onSubframeClosed(storeSlot, slotOwnerService); },
        };
    }

    public createSlotOwnerService<TKey, TStore>(
        slotOwnerServiceOptions: Omit<
            TOIMSlotOwnerServiceOptions<
                TKey, TOIMBucketSlot<TSlots, TKey>, TStore, string, TOIMColumnSlot, OIMColumnOwnerPushDriven, readonly TBucketMemberSlot[]
            >,
            'slotContentStrategy' | 'slotContentFlushStrategy'
        >,
    ): TOIMBucketSlotOwnerService<TSlots, TBucketMemberSlot, TKey, TStore> {
        return new OIMSlotOwnerService<
            TKey, TOIMBucketSlot<TSlots, TKey>, TStore, string, TOIMColumnSlot, OIMColumnOwnerPushDriven, readonly TBucketMemberSlot[]
        >({
            ...slotOwnerServiceOptions,
            slotContentStrategy: this.slotContentStrategy as IOIMSlotContentStrategy<
                TOIMBucketSlot<TSlots, TKey>, TKey, TOIMBucketSlotOwnerService<TSlots, TBucketMemberSlot, TKey, TStore>
            >,
            slotContentFlushStrategy: this.slotContentStrategy,
        });
    }

    protected abstract createBucketMemberSlotsStore(): TSlots;

    protected abstract addSlot(bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): boolean;

    protected abstract removeSlot(bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): number;

    protected abstract removeSlots(
        bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void;

    protected abstract reconcileSlots(
        bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlots: readonly TBucketMemberSlot[],
        arrivedChannelQueue: OIMChannelQueue<TOIMSlot>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void;

    protected abstract drainSlots(bucketSlot: TOIMBucketSlot<TSlots>, departedChannelQueue: OIMChannelQueue<TOIMSlot>): void;

    public abstract hasBucketMemberSlot(bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): boolean;

    public abstract getBucketMemberSlotCount(bucketSlot: TOIMBucketSlot<TSlots>): number;

    public abstract getBucketMemberSlots(bucketSlot: TOIMBucketSlot<TSlots>): Iterable<TBucketMemberSlot>;

    protected createSlot<TKey>(
        key: TKey, storeSlot: TOIMStoreSlot | undefined, slotOwnerService: TOIMBucketSlotOwnerService<TSlots>,
    ): TOIMBucketSlot<TSlots, TKey> {
        if (storeSlot === undefined) {
            throw new Error(
                'OIMSlotContentBucketService: a bucket is minted into a store slot and none was given. '
                + 'Mint it through its collection or single service.',
            );
        }
        return createOIMBucketSlot(
            key, slotOwnerService, this.createBucketMemberSlotsStore(), storeSlot as TOIMStoreSlot<unknown, TOIMBucketSlot<TSlots>>,
        );
    }

    public isSlotEmpty(bucketSlot: TOIMBucketSlot<TSlots>): boolean {
        return this.getBucketMemberSlotCount(bucketSlot) === 0;
    }

    protected hasReference(bucketSlot: TOIMBucketSlot<TSlots>): boolean {
        return bucketSlot.wasEmptyBeforeChange !== undefined;
    }

    protected releaseSlotContent(
        bucketSlot: TOIMBucketSlot<TSlots>, slotOwnerService: TOIMBucketSlotOwnerService<TSlots>,
    ): void {
        if (this.unholdAllBucketMemberSlots(bucketSlot) === 0) return;
        slotOwnerService.dispatchContentChange(bucketSlot);
    }

    protected onSubframeClosed(
        storeSlot: TOIMStoreSlot<unknown, TOIMBucketSlot<TSlots>>, slotOwnerService: TOIMBucketSlotOwnerService<TSlots>,
    ): void {
        const changedBucketSlotChannelQueue = storeSlot.changedBucketSlotChannelQueue;
        if (changedBucketSlotChannelQueue === undefined) return;
        let isRefused = false;
        let refusal: unknown;
        try {
            for (let i = 0; i < changedBucketSlotChannelQueue.getEntryCount(); i++) {
                const bucketSlot = changedBucketSlotChannelQueue.getEntryAt(i);
                const bucketSlotEditable = bucketSlot as TOIMSlotEditable<TOIMBucketSlot<TSlots>>;
                const isChangedAgain = bucketSlot.isChangedAgainInSubframe;
                bucketSlotEditable.isChangedAgainInSubframe = false;
                bucketSlotEditable.wasEmptyBeforeChange = undefined;
                try {
                    if (isChangedAgain && !oimIsSlotReleased(bucketSlot)) this.writeChangedBucketSlot(bucketSlot, false, slotOwnerService);
                } catch (error) {
                    if (!isRefused) refusal = error;
                    isRefused = true;
                }
                try {
                    slotOwnerService.releaseSlotIfUnheld(bucketSlot);
                } catch (error) {
                    if (!isRefused) refusal = error;
                    isRefused = true;
                }
            }
        } finally {
            changedBucketSlotChannelQueue.keepFirstEntries(0);
        }
        if (isRefused) throw refusal;
    }

    public markContentChanged(bucketSlot: TOIMBucketSlot<TSlots>): void {
        (bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>).assertWritable(bucketSlot);
        this.markBucketSlotChanged(bucketSlot);
    }

    public markBucketColumnsChanged(
        bucketSlot: TOIMBucketSlot<TSlots>,
        patch: object | undefined, changedColumns: readonly string[] | undefined,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        if (!slotOwnerService.hasColumnSlots(bucketSlot)) return;
        slotOwnerService.columnOwner.markColumnsChanged(bucketSlot, patch, changedColumns, oimGetChannelSlot(bucketSlot));
    }

    public addBucketMemberSlot(
        bucketSlot: TOIMBucketSlot<TSlots>,
        bucketMemberSlot: TBucketMemberSlot,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        this.assertBucketMemberSlotNotReleased(bucketMemberSlot);
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            if (this.addBucketMemberSlotWithoutSubframe(bucketSlot, bucketMemberSlot)) this.markBucketSlotChanged(bucketSlot);
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public removeBucketMemberSlot(
        bucketSlot: TOIMBucketSlot<TSlots>,
        bucketMemberSlot: TBucketMemberSlot,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const at = this.removeSlot(bucketSlot, bucketMemberSlot);
            if (at === OIM_NOTHING_WAS_REMOVED) return;
            this.letGoOfRemovedBucketMemberSlot(bucketSlot, bucketMemberSlot, at);
            this.markBucketSlotChanged(bucketSlot);
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public addBucketMemberSlots(
        bucketSlot: TOIMBucketSlot<TSlots>,
        bucketMemberSlots: readonly TBucketMemberSlot[],
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        this.assertBucketMemberSlotsNotReleased(bucketMemberSlots);
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            let isAnyAdded = false;
            for (let i = 0; i < bucketMemberSlots.length; i++) {
                if (this.addBucketMemberSlotWithoutSubframe(bucketSlot, bucketMemberSlots[i])) isAnyAdded = true;
            }
            if (isAnyAdded) this.markBucketSlotChanged(bucketSlot);
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public removeBucketMemberSlots(
        bucketSlot: TOIMBucketSlot<TSlots>,
        bucketMemberSlots: readonly TBucketMemberSlot[],
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        const storeSlotEditable = bucketSlot.storeSlot as TOIMSlotEditable<TOIMStoreSlot>;
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
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
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public writeBucketMemberSlots(
        bucketSlot: TOIMBucketSlot<TSlots>,
        bucketMemberSlots: readonly TBucketMemberSlot[],
    ): boolean {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            if (!this.reconcileBucketMemberSlots(bucketSlot, bucketMemberSlots)) return false;
            this.markBucketSlotChanged(bucketSlot);
            return true;
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public clearBucketMemberSlots(bucketSlot: TOIMBucketSlot<TSlots>): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            if (this.drainBucketMemberSlots(bucketSlot)) this.markBucketSlotChanged(bucketSlot);
            else slotOwnerService.releaseSlotIfUnheld(bucketSlot);
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public fillBucketMemberSlots(
        bucketSlot: TOIMBucketSlot<TSlots>,
        bucketMemberSlots: readonly TBucketMemberSlot[],
    ): void {
        if (bucketSlot.changedAtRevision !== 0 || bucketSlot.wasEmptyBeforeChange !== undefined) {
            throw new Error(
                'OIMSlotContentBucketService: fillBucketMemberSlots fills only a bucket nobody was told about yet, and this one '
                + 'was announced. Use addBucketMemberSlots or writeBucketMemberSlots, which tell its listeners.',
            );
        }
        this.assertBucketMemberSlotsNotReleased(bucketMemberSlots);
        for (let i = 0; i < bucketMemberSlots.length; i++) {
            const bucketMemberSlot = bucketMemberSlots[i];
            if (this.addSlot(bucketSlot, bucketMemberSlot)) bucketMemberSlot.owner.holdSlot(bucketMemberSlot);
        }
    }

    protected markBucketSlotChanged(
        bucketSlot: TOIMBucketSlot<TSlots>,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        const bucketSlotEditable = bucketSlot as TOIMSlotEditable<TOIMBucketSlot<TSlots>>;
        const isFirstChange = bucketSlot.wasEmptyBeforeChange === undefined;
        if (isFirstChange) bucketSlotEditable.wasEmptyBeforeChange = oimIsSlotEmpty(bucketSlot);
        slotOwnerService.markEmptiness(bucketSlot, this.isSlotEmpty(bucketSlot));
        if (
            !OIMChannelService.INSTANCE.isSubframeOpen(oimGetChannelSlot(bucketSlot))
            || (bucketSlot.holdCount > 0 && !slotOwnerService.hasContentChangeListeners(bucketSlot))
        ) {
            this.flushChangedBucketSlot(bucketSlot, slotOwnerService);
            return;
        }
        if (!isFirstChange) {
            bucketSlotEditable.isChangedAgainInSubframe = true;
            return;
        }
        const storeSlot = bucketSlot.storeSlot;
        const changedBucketSlotChannelQueue = (storeSlot as TOIMSlotEditable<TOIMStoreSlot<unknown, TOIMBucketSlot<TSlots>>>)
            .changedBucketSlotChannelQueue ??= new OIMChannelQueue<TOIMBucketSlot<TSlots>>();
        if (changedBucketSlotChannelQueue.getEntryCount() === 0) slotOwnerService.listChangedStoreSlot(storeSlot);
        changedBucketSlotChannelQueue.enqueueEntry(bucketSlot);
        this.writeChangedBucketSlot(bucketSlot, bucketSlot.wasEmptyBeforeChange === true, slotOwnerService);
    }

    protected letGoOfRemovedBucketMemberSlot(bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlot: TOIMSlot, at: number): void {
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

    private addBucketMemberSlotWithoutSubframe(bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): boolean {
        if (!this.addSlot(bucketSlot, bucketMemberSlot)) return false;
        bucketMemberSlot.owner.holdSlot(bucketMemberSlot);
        const bucketMemberSlotCount = this.getBucketMemberSlotCount(bucketSlot);
        this.bucketCommands.recordInsert(bucketSlot, bucketMemberSlotCount - 1, bucketMemberSlot, bucketMemberSlotCount);
        return true;
    }

    private reconcileBucketMemberSlots(
        bucketSlot: TOIMBucketSlot<TSlots>,
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

    private drainBucketMemberSlots(bucketSlot: TOIMBucketSlot<TSlots>): boolean {
        if (this.getBucketMemberSlotCount(bucketSlot) === 0) return false;
        if (this.unholdAllBucketMemberSlots(bucketSlot) === 0) return false;
        this.bucketCommands.recordWholeList(bucketSlot);
        return true;
    }

    private unholdAllBucketMemberSlots(bucketSlot: TOIMBucketSlot<TSlots>): number {
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

    private writeChangedBucketSlot(
        bucketSlot: TOIMBucketSlot<TSlots>, wasEmpty: boolean, slotOwnerService: TOIMBucketSlotOwnerService<TSlots>,
    ): void {
        slotOwnerService.writeSlotToChannelAndSettle(bucketSlot, wasEmpty);
        slotOwnerService.dispatchContentChange(bucketSlot);
    }

    private flushChangedBucketSlot(
        bucketSlot: TOIMBucketSlot<TSlots>, slotOwnerService: TOIMBucketSlotOwnerService<TSlots>,
    ): void {
        const wasEmpty = bucketSlot.wasEmptyBeforeChange;
        if (wasEmpty === undefined) return;
        (bucketSlot as TOIMSlotEditable<TOIMBucketSlot<TSlots>>).wasEmptyBeforeChange = undefined;
        if (oimIsSlotReleased(bucketSlot)) return;
        this.writeChangedBucketSlot(bucketSlot, wasEmpty, slotOwnerService);
    }
}
