import { OIMSlotOwner } from './OIMSlotOwner';
import type { IOIMSlotStamp } from './interfaces/IOIMSlotStamp';
import type { IOIMSlotReleasePolicy } from '../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotContentService } from './interfaces/IOIMSlotContentService';
import type { IOIMSlotFilingService } from '../store/interfaces/IOIMSlotFilingService';
import { OIMChannelService } from '../channel/OIMChannelService';
import { OIMSlotContentChangeDeliveryService } from './OIMSlotContentChangeDeliveryService';
import { OIMUnusedSlotCollectorService } from '../collector/OIMUnusedSlotCollectorService';
import type { OIMColumnSlotOwner } from '../column/OIMColumnSlotOwner';
import type { TOIMSlot } from './types/TOIMSlot';
import type { IOIMSlotOwner } from './interfaces/IOIMSlotOwner';
import type { TOIMEditable } from './types/TOIMEditable';
import type { TOIMKeyedSlot } from './types/TOIMKeyedSlot';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import type { TOIMSlotOwnerServiceOptions } from './types/TOIMSlotOwnerServiceOptions';
import { OIMColumnSlotService } from '../column/OIMColumnSlotService';
import { OIMSlotAtEmptyReleasePolicy } from '../collector/OIMSlotAtEmptyReleasePolicy';
import { assertOIMSlotNotReleased } from './utils/assertOIMSlotNotReleased';
import { peekOIMChannelSlot } from './utils/peekOIMChannelSlot';
import { isOIMSlotEmpty } from './utils/isOIMSlotEmpty';
import { isOIMSlotReleased } from './utils/isOIMSlotReleased';
import type { OIMCollectionSetBucketContentService } from '../bucket/OIMCollectionSetBucketContentService';
import { markOIMSlotReleased } from './utils/markOIMSlotReleased';
import { OIM_SLOT_FLAG_QUEUED_IN_BATCH } from './constants/OIM_SLOT_FLAG_QUEUED_IN_BATCH';
import { OIM_SLOT_FLAG_EMPTY } from './constants/OIM_SLOT_FLAG_EMPTY';
import { OIM_SLOT_FLAG_RELEASED } from './constants/OIM_SLOT_FLAG_RELEASED';

type TOIMCollectionBucketSlotOwner<TSlot extends TOIMSlot> = { readonly slotContentService: OIMCollectionSetBucketContentService<TSlot> };

export class OIMSlotOwnerService<
    TSlot extends TOIMSlot, TStore, TColumnName extends string, TColumnSlot extends TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> extends OIMSlotOwner {
    public readonly slotContentService: IOIMSlotContentService<TSlot>;

    private readonly slotFilingService: IOIMSlotFilingService<TSlot, TStore>;

    private readonly slotStamp: IOIMSlotStamp<TSlot> | undefined;

    private readonly slotReleasePolicy: IOIMSlotReleasePolicy;

    private readonly releasesWrittenSlots: boolean;

    private readonly schedulesReleaseOnWrite: boolean;

    public readonly settlesWrittenSlots: boolean;

    public readonly columnSlotOwner: TColumnSlotOwner;

    public readonly columnSlotService: OIMColumnSlotService<TSlot, TColumnName, TColumnSlot, TColumnSlotOwner>;

    public constructor(
        options: TOIMSlotOwnerServiceOptions<TSlot, TStore, TColumnName, TColumnSlot, TColumnSlotOwner>,
    ) {
        super(options.slotSubscriptionListener);
        this.slotContentService = options.slotContentService;
        this.slotFilingService = options.slotFilingService;
        this.slotStamp = options.slotStamp;
        const slotReleasePolicy = options.slotReleasePolicy ?? OIMSlotAtEmptyReleasePolicy.INSTANCE;
        this.slotReleasePolicy = slotReleasePolicy;
        this.releasesWrittenSlots = slotReleasePolicy.releasesWrittenSlots;
        this.schedulesReleaseOnWrite = slotReleasePolicy.schedulesReleaseOnWrite;
        this.settlesWrittenSlots = this.releasesWrittenSlots || this.schedulesReleaseOnWrite || options.slotStamp !== undefined;
        this.columnSlotOwner = options.createColumnSlotOwner(options.columnSlotOwnerOptions, options.slotSubscriptionListener);
        this.columnSlotService = new OIMColumnSlotService<TSlot, TColumnName, TColumnSlot, TColumnSlotOwner>(this.columnSlotOwner);
    }

    public isSlotEmpty(slot: TSlot): boolean {
        return this.slotContentService.isSlotEmpty(slot);
    }

    public hasColumnSlots(slot: TOIMSlot): boolean {
        return slot.columnSlotStore !== undefined;
    }

    public hasContentChangeListeners(slot: TOIMSlot): boolean {
        const listeners = slot.storeSlot.contentChangeListeners;
        return listeners !== undefined && listeners.length !== 0;
    }

    public dispatchContentChange(slot: TSlot, patch?: TPatch, changedColumns?: readonly string[]): void {
        const storeSlot = slot.storeSlot as TOIMStoreSlot<unknown, TSlot, TPatch>;
        const listeners = storeSlot.contentChangeListeners;
        if (listeners === undefined || listeners.length === 0) return;
        if (changedColumns !== undefined && !this.isAnyColumnRead(storeSlot, changedColumns)) return;
        if (storeSlot.batchDepth > 0) {
            OIMSlotContentChangeDeliveryService.INSTANCE.enqueueContentChange(storeSlot, slot, patch, changedColumns);
            return;
        }
        for (let i = 0; i < listeners.length; i++) listeners[i].onContentChanged(slot, patch, changedColumns);
    }

    public isAnyColumnRead(storeSlot: TOIMStoreSlot, changedColumns: readonly string[]): boolean {
        if (storeSlot.allColumnsListenerCount !== 0) return true;
        const columnListenerCountsByColumnName = storeSlot.columnListenerCountsByColumnName;
        if (columnListenerCountsByColumnName === undefined || columnListenerCountsByColumnName.size === 0) return false;
        for (let i = 0; i < changedColumns.length; i++) {
            if (columnListenerCountsByColumnName.has(changedColumns[i])) return true;
        }
        return false;
    }

    public releaseWrittenSlotIfUnheld(slot: TSlot): void {
        if (this.releasesWrittenSlots) this.releaseSlotIfUnheld(slot);
    }

    public assertWritable(slot: TOIMSlot): void {
        OIMChannelService.INSTANCE.assertNotFlushing(peekOIMChannelSlot(slot));
        assertOIMSlotNotReleased(slot);
    }

    public fileSlot(slot: TSlot): void {
        this.slotFilingService.set((slot.storeSlot as TOIMStoreSlot<TStore, TSlot>).store, slot);
    }

    public markSlotContentChanged(slot: TSlot, isEmpty: boolean): void {
        const wasEmpty = isOIMSlotEmpty(slot);
        this.markEmptiness(slot, isEmpty);
        if (isOIMSlotReleased(slot)) return;
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(peekOIMChannelSlot(slot), slot);
        this.settleWrite(slot, wasEmpty);
        this.dispatchContentChange(slot);
        this.releaseSlotIfUnheld(slot);
    }


    public settleEmptiness(slot: TSlot, isEmpty: boolean): void {
        const wasEmpty = (slot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0;
        this.markEmptiness(slot, isEmpty);
        this.settleWrite(slot, wasEmpty);
    }

    public markEmptiness(slot: TSlot, isEmpty: boolean): void {
        const slotFlags = slot.slotFlags;
        (slot as TOIMEditable<TSlot>).slotFlags = isEmpty ? slotFlags | OIM_SLOT_FLAG_EMPTY : slotFlags & ~OIM_SLOT_FLAG_EMPTY;
        if (((slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0) === isEmpty) return;
        const collectionBucketSlot = (slot.storeSlot as TOIMStoreSlot<TStore, TSlot>).collectionBucketSlot;
        if (collectionBucketSlot === undefined || isOIMSlotReleased(collectionBucketSlot)) return;
        const collectionSetBucketContentService = (collectionBucketSlot.owner as IOIMSlotOwner & TOIMCollectionBucketSlotOwner<TSlot>).slotContentService;
        if (isEmpty) collectionSetBucketContentService.onCollectionSlotEmptied(collectionBucketSlot, slot);
        else collectionSetBucketContentService.onCollectionSlotFilled(collectionBucketSlot, slot);
    }

    private settleWrite(slot: TSlot, wasEmpty: boolean): void {
        if (this.slotStamp !== undefined) this.slotStamp.stamp(slot as TOIMEditable<TSlot>);
        if (isOIMSlotEmpty(slot) || !this.schedulesReleaseOnWrite) return;
        this.slotReleasePolicy.onSlotWritten(slot);
        if (wasEmpty && (slot.effects === undefined || slot.effects.length === 0)) this.scheduleSlotRelease(slot);
    }

    private scheduleSlotRelease(slot: TSlot): void {
        if (this.slotReleasePolicy.onSlotIdle(slot)) {
            OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(peekOIMChannelSlot(slot).collectorSlot.unusedSlotCollectorSlot, slot);
        }
    }

    protected override onSlotLastUnsubscribed(slot: TOIMSlot): void {
        if (!isOIMSlotEmpty(slot)) this.slotReleasePolicy.onSlotIdle(slot);
        super.onSlotLastUnsubscribed(slot);
    }

    protected override onSlotUnheld(slot: TSlot): void {
        this.slotReleasePolicy.onSlotUnheld(slot);
        super.onSlotUnheld(slot);
    }

    public override releaseSlotIfUnheld(slot: TOIMSlot): void {
        const ownSlot = slot as TSlot;
        const slotFlags = ownSlot.slotFlags;
        if ((slotFlags & (OIM_SLOT_FLAG_RELEASED | OIM_SLOT_FLAG_QUEUED_IN_BATCH)) !== 0) return;
        const isEmpty = (slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0;
        if (!isEmpty && !this.releasesWrittenSlots) return;
        if (!this.isReleasable(ownSlot)) return;
        if (isEmpty
            ? !this.slotReleasePolicy.isEmptySlotReleasable(ownSlot)
            : !this.slotReleasePolicy.isSlotReleasable(ownSlot)) return;
        this.releaseSlot(ownSlot);
    }

    private isReleasable(slot: TSlot): boolean {
        if (slot.holdCount > 0) return false;
        if (slot.owner !== this) return false;
        return slot.columnSlotStore === undefined;
    }

    private releaseSlot(slot: TSlot): void {
        this.slotContentService.releaseSlotContent(slot);
        this.slotReleasePolicy.cancelSlotRelease(slot);
        this.slotFilingService.delete((slot.storeSlot as TOIMStoreSlot<TStore, TSlot>).store, slot);
        markOIMSlotReleased(slot);
        this.markEmptiness(slot, true);
    }
}
