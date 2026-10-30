import type { IOIMSlotStamp } from './interfaces/IOIMSlotStamp';
import type { IOIMSlotReleasePolicy } from '../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from './interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotContentService } from './interfaces/IOIMSlotContentService';
import type { IOIMSlotFilingService } from '../store/interfaces/IOIMSlotFilingService';
import type { TOIMChannelSlot } from '../channel/types/TOIMChannelSlot';
import { OIMChannelService } from '../channel/OIMChannelService';
import { OIMNoSlotSubscriptionListener } from './OIMNoSlotSubscriptionListener';
import { OIMSlotContentChangeDeliveryService } from './OIMSlotContentChangeDeliveryService';
import { OIMUnusedSlotCollectorService } from '../collector/OIMUnusedSlotCollectorService';
import type { OIMColumnSlotOwner } from '../column/OIMColumnSlotOwner';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMEditable } from './types/TOIMEditable';
import type { TOIMKeyedSlot } from './types/TOIMKeyedSlot';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import type { TOIMSlotOwnerServiceOptions } from './types/TOIMSlotOwnerServiceOptions';
import { OIMSlotOwner } from './OIMSlotOwner';
import { OIMSlotAtEmptyReleasePolicy } from '../collector/OIMSlotAtEmptyReleasePolicy';
import { oimAssertSlotNotReleased } from './utils/oimAssertSlotNotReleased';
import { oimGetChannelSlot } from './utils/oimGetChannelSlot';
import { oimIsSlotEmpty } from './utils/oimIsSlotEmpty';
import { oimMarkSlotReleased } from './utils/oimMarkSlotReleased';
import { OIM_SLOT_FLAG_QUEUED_IN_BATCH } from './constants/OIM_SLOT_FLAG_QUEUED_IN_BATCH';
import { OIM_SLOT_FLAG_EMPTY } from './constants/OIM_SLOT_FLAG_EMPTY';
import { OIM_SLOT_FLAG_RELEASED } from './constants/OIM_SLOT_FLAG_RELEASED';


export class OIMSlotOwnerService<
    TSlot extends TOIMSlot, TStore, TColumnName extends string, TColumnSlot extends TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> extends OIMSlotOwner {
    private readonly slotContentService: IOIMSlotContentService<TSlot>;

    private readonly slotFilingService: IOIMSlotFilingService<TSlot, TStore>;

    private readonly slotStamp: IOIMSlotStamp<TSlot> | undefined;

    private readonly slotReleasePolicy: IOIMSlotReleasePolicy;

    private readonly releasesWrittenSlots: boolean;

    private readonly schedulesReleaseOnWrite: boolean;

    public readonly settlesWrittenSlots: boolean;

    private readonly slotSubscriptionListener: IOIMSlotSubscriptionListener;

    public readonly columnSlotOwner: TColumnSlotOwner;

    public constructor(
        options: TOIMSlotOwnerServiceOptions<TSlot, TStore, TColumnName, TColumnSlot, TColumnSlotOwner>,
    ) {
        super();
        this.slotContentService = options.slotContentService;
        this.slotFilingService = options.slotFilingService;
        this.slotStamp = options.slotStamp;
        const slotReleasePolicy = options.slotReleasePolicy ?? OIMSlotAtEmptyReleasePolicy.INSTANCE;
        this.slotReleasePolicy = slotReleasePolicy;
        this.releasesWrittenSlots = slotReleasePolicy.releasesWrittenSlots;
        this.schedulesReleaseOnWrite = slotReleasePolicy.schedulesReleaseOnWrite;
        this.settlesWrittenSlots = this.releasesWrittenSlots || this.schedulesReleaseOnWrite || options.slotStamp !== undefined;
        this.slotSubscriptionListener = options.slotSubscriptionListener ?? OIMNoSlotSubscriptionListener.INSTANCE;
        this.columnSlotOwner = options.createColumnSlotOwner(options.columnSlotOwnerOptions);
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

    public isAnyColumnReferenced(slot: TOIMSlot, changedColumns: readonly string[]): boolean {
        const storeSlot = slot.storeSlot;
        return (slot.columnSlotStore !== undefined && this.columnSlotOwner.isAnyColumnReferenced(storeSlot, changedColumns))
            || this.isAnyColumnRead(storeSlot, changedColumns);
    }

    private isAnyColumnRead(storeSlot: TOIMStoreSlot, changedColumns: readonly string[]): boolean {
        if (storeSlot.allColumnsListenerCount !== 0) return true;
        const columnListenerCountsByColumnName = storeSlot.columnListenerCountsByColumnName;
        if (columnListenerCountsByColumnName === undefined || columnListenerCountsByColumnName.size === 0) return false;
        for (let i = 0; i < changedColumns.length; i++) {
            if (columnListenerCountsByColumnName.has(changedColumns[i])) return true;
        }
        return false;
    }

    public takeChangedColumnNames(channelSlot: TOIMChannelSlot): string[] {
        const changedColumnNames = channelSlot.changedColumnNames;
        if (changedColumnNames === undefined) return (channelSlot.changedColumnNames = []);
        if (changedColumnNames.length !== 0) changedColumnNames.length = 0;
        return changedColumnNames;
    }

    public releaseSlotIfUnheldAfterListeners(slot: TSlot): void {
        if ((slot.slotFlags & OIM_SLOT_FLAG_QUEUED_IN_BATCH) !== 0) return;
        this.releaseSlotIfUnheld(slot);
    }

    public releaseWrittenSlotIfUnheld(slot: TSlot): void {
        if (this.releasesWrittenSlots) this.releaseSlotIfUnheldAfterListeners(slot);
    }

    public assertWritable(slot: TOIMSlot): void {
        OIMChannelService.INSTANCE.assertNotFlushing(oimGetChannelSlot(slot));
        oimAssertSlotNotReleased(slot);
    }

    public fileSlot(slot: TSlot): void {
        this.slotFilingService.fileSlot((slot.storeSlot as TOIMStoreSlot<TStore, TSlot>).store, slot);
    }

    public writeSlotToChannelAndSettle(slot: TSlot, wasEmpty: boolean): void {
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(oimGetChannelSlot(slot), slot);
        this.settleWrite(slot, wasEmpty);
    }

    public settleEmptiness(slot: TSlot, isEmpty: boolean): void {
        const wasEmpty = (slot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0;
        this.markEmptiness(slot, isEmpty);
        this.settleWrite(slot, wasEmpty);
    }

    public markEmptiness(slot: TSlot, isEmpty: boolean): void {
        const slotFlags = slot.slotFlags;
        (slot as TOIMEditable<TSlot>).slotFlags = isEmpty ? slotFlags | OIM_SLOT_FLAG_EMPTY : slotFlags & ~OIM_SLOT_FLAG_EMPTY;
    }

    private settleWrite(slot: TSlot, wasEmpty: boolean): void {
        if (this.slotStamp !== undefined) this.slotStamp.stamp(slot as TOIMEditable<TSlot>);
        if (oimIsSlotEmpty(slot) || !this.schedulesReleaseOnWrite) return;
        this.slotReleasePolicy.onSlotWritten(slot);
        if (wasEmpty && (slot.effects === undefined || slot.effects.length === 0)) this.scheduleSlotRelease(slot);
    }

    private scheduleSlotRelease(slot: TSlot): void {
        if (this.slotReleasePolicy.onSlotIdle(slot)) {
            OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(oimGetChannelSlot(slot).collectorSlot.unusedSlotCollectorSlot, slot);
        }
    }

    protected override onSlotIdle(slot: TSlot): void {
        if (oimIsSlotEmpty(slot)) return;
        this.slotReleasePolicy.onSlotIdle(slot);
    }

    public override onSlotFirstSubscribed(slot: TOIMSlot): void {
        this.slotSubscriptionListener.onSlotFirstSubscribed(slot);
    }

    public override onSlotLastUnsubscribed(slot: TOIMSlot): void {
        this.slotSubscriptionListener.onSlotLastUnsubscribed(slot);
    }

    protected override onSlotUnheld(slot: TSlot): void {
        this.slotReleasePolicy.onSlotUnheld(slot);
    }

    public override releaseSlotIfUnheld(slot: TOIMSlot): void {
        const ownSlot = slot as TSlot;
        const slotFlags = ownSlot.slotFlags;
        if ((slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) return;
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
        if (slot.columnSlotStore !== undefined) return false;
        return !this.slotContentService.hasReference(slot);
    }

    private releaseSlot(slot: TSlot): void {
        this.slotContentService.releaseSlotContent(slot);
        (slot as TOIMEditable<TSlot>).slotFlags |= OIM_SLOT_FLAG_EMPTY;
        this.slotReleasePolicy.cancelSlotRelease(slot);
        this.slotFilingService.unfileSlot((slot.storeSlot as TOIMStoreSlot<TStore, TSlot>).store, slot);
        oimMarkSlotReleased(slot);
    }
}
