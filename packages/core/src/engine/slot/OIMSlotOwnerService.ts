import type { IOIMSlotStamp } from './interfaces/IOIMSlotStamp';
import type { IOIMSlotReleasePolicy } from '../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSubframeCloseListener } from './interfaces/IOIMSubframeCloseListener';
import type { IOIMSlotContentStrategy } from './interfaces/IOIMSlotContentStrategy';
import type { IOIMSlotContentFlushStrategy } from './interfaces/IOIMSlotContentFlushStrategy';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMChannelSlot } from '../channel/types/TOIMChannelSlot';
import { OIMChannelService } from '../channel/OIMChannelService';
import { OIMContentChangeDeliveryService } from './OIMContentChangeDeliveryService';
import { OIMUnusedSlotCollectorService } from '../collector/OIMUnusedSlotCollectorService';
import type { OIMColumnOwner } from '../column/OIMColumnOwner';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMSlotEditable } from './types/TOIMSlotEditable';
import type { TOIMKeyedSlot } from './types/TOIMKeyedSlot';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import type { TOIMSlotOwnerServiceOptions } from './types/TOIMSlotOwnerServiceOptions';
import { OIMSlotOwner } from './OIMSlotOwner';
import { OIMSlotReleasePolicyAtEmpty } from '../collector/OIMSlotReleasePolicyAtEmpty';
import { oimAssertSlotNotReleased } from './utils/oimAssertSlotNotReleased';
import { oimGetChannelSlot } from './utils/oimGetChannelSlot';
import { oimIsSlotEmpty } from './utils/oimIsSlotEmpty';
import { oimMarkSlotReleased } from './utils/oimMarkSlotReleased';
import { OIM_SLOT_FLAG_EMPTY } from './constants/OIM_SLOT_FLAG_EMPTY';
import { OIM_SLOT_FLAG_RELEASED } from './constants/OIM_SLOT_FLAG_RELEASED';


export class OIMSlotOwnerService<
    TKey, TSlot extends TOIMKeyedSlot<TKey>, TStore, TColumnName extends string, TColumnSlot extends TOIMKeyedSlot<string>,
    TColumnOwner extends OIMColumnOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> extends OIMSlotOwner implements IOIMSubframeCloseListener {
    private readonly slotContentStrategy: IOIMSlotContentStrategy<
        TSlot, TKey, OIMSlotOwnerService<TKey, TSlot, TStore, TColumnName, TColumnSlot, TColumnOwner, TPatch>
    >;

    private readonly slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore>;

    private readonly slotStamp: IOIMSlotStamp<TSlot> | undefined;

    private readonly slotReleasePolicy: IOIMSlotReleasePolicy;

    private readonly releasesWrittenSlots: boolean;

    private readonly schedulesReleaseOnWrite: boolean;

    public readonly columnOwner: TColumnOwner;

    private readonly slotContentFlushStrategy: IOIMSlotContentFlushStrategy<
        TSlot, OIMSlotOwnerService<TKey, TSlot, TStore, TColumnName, TColumnSlot, TColumnOwner, TPatch>
    > | undefined;

    public constructor(
        options: TOIMSlotOwnerServiceOptions<TKey, TSlot, TStore, TColumnName, TColumnSlot, TColumnOwner, TPatch>,
    ) {
        super();
        this.slotContentStrategy = options.slotContentStrategy;
        this.slotStoreService = options.slotStoreService;
        this.slotStamp = options.slotStamp;
        const slotReleasePolicy = options.slotReleasePolicy ?? OIMSlotReleasePolicyAtEmpty.INSTANCE;
        this.slotReleasePolicy = slotReleasePolicy;
        this.releasesWrittenSlots = slotReleasePolicy.releasesWrittenSlots;
        this.schedulesReleaseOnWrite = slotReleasePolicy.schedulesReleaseOnWrite;
        this.columnOwner = options.createColumnOwner(options.columnOwnerOptions);
        this.slotContentFlushStrategy = options.slotContentFlushStrategy;
    }

    public listChangedStoreSlot(storeSlot: TOIMStoreSlot<unknown, TSlot>): void {
        OIMChannelService.INSTANCE.listChangedStoreSlot(storeSlot.channelSlot, storeSlot as TOIMStoreSlot, this);
    }

    public onStoreSlotSubframeClosed(storeSlot: TOIMStoreSlot): void {
        this.slotContentFlushStrategy?.onSubframeClosed(storeSlot as TOIMStoreSlot<unknown, TSlot>, this);
    }

    public createSlot(key: TKey, storeSlot: TOIMStoreSlot | undefined): TSlot {
        return this.slotContentStrategy.createSlot(key, storeSlot, this);
    }

    public isSlotEmpty(slot: TSlot): boolean {
        return this.slotContentStrategy.isSlotEmpty(slot);
    }

    public hasColumnSlots(slot: TOIMSlot): boolean {
        return slot.columnSlotStore !== undefined;
    }

    public hasContentChangeListeners(slot: TOIMSlot): boolean {
        const storeSlot = slot.storeSlot;
        if (storeSlot === undefined) return false;
        const listeners = storeSlot.contentChangeListeners;
        return listeners !== undefined && listeners.length !== 0;
    }

    public dispatchContentChange(slot: TSlot, patch?: TPatch, changedColumns?: readonly string[]): void {
        const storeSlot = slot.storeSlot as TOIMStoreSlot<unknown, TSlot, TPatch> | undefined;
        if (storeSlot === undefined) return;
        const listeners = storeSlot.contentChangeListeners;
        if (listeners === undefined || listeners.length === 0) return;
        if (changedColumns !== undefined && !this.isAnyColumnRead(storeSlot, changedColumns)) return;
        const channelSlot = storeSlot.channelSlot;
        const contentChangeDeliveryService = OIMContentChangeDeliveryService.INSTANCE;
        if (contentChangeDeliveryService.isDeliveryDeferred(channelSlot)) {
            contentChangeDeliveryService.enqueueContentChange(channelSlot, storeSlot, slot, patch, changedColumns);
            return;
        }
        for (let i = 0; i < listeners.length; i++) listeners[i].onContentChanged(slot, patch, changedColumns);
    }

    public isAnyColumnReferenced(slot: TOIMSlot, changedColumns: readonly string[]): boolean {
        const storeSlot = slot.storeSlot;
        if (storeSlot === undefined) return false;
        return this.columnOwner.isAnyColumnReferenced(storeSlot, changedColumns) || this.isAnyColumnRead(storeSlot, changedColumns);
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
        const storeSlot = slot.storeSlot;
        if (storeSlot !== undefined) {
            const contentChangeDeliveryService = OIMContentChangeDeliveryService.INSTANCE;
            const channelSlot = storeSlot.channelSlot;
            if (contentChangeDeliveryService.isDeliveryDeferred(channelSlot)
                && contentChangeDeliveryService.isLastEnqueuedSlot(channelSlot, storeSlot, slot)) return;
        }
        this.releaseSlotIfUnheld(slot);
    }

    public releaseWrittenSlotIfUnheld(slot: TSlot): void {
        if (this.releasesWrittenSlots) this.releaseSlotIfUnheldAfterListeners(slot);
    }

    public assertWritable(slot: TOIMSlot): void {
        OIMChannelService.INSTANCE.assertNotFlushing(oimGetChannelSlot(slot));
        oimAssertSlotNotReleased(slot);
    }

    public fileSlot(storeSlot: TOIMStoreSlot<TStore, TSlot>, slot: TSlot): void {
        this.slotStoreService.set(storeSlot.store, slot.key, slot);
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
        (slot as TOIMSlotEditable<TSlot>).slotFlags = isEmpty ? slotFlags | OIM_SLOT_FLAG_EMPTY : slotFlags & ~OIM_SLOT_FLAG_EMPTY;
    }

    private settleWrite(slot: TSlot, wasEmpty: boolean): void {
        if (this.slotStamp !== undefined) this.slotStamp.stamp(slot as TOIMSlotEditable<TSlot>);
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
        if (this.slotReleasePolicy.onSlotIdle(slot)) this.releaseSlotIfUnheld(slot);
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
        if (!isEmpty) {
            const channelSlot = oimGetChannelSlot(ownSlot);
            if (OIMChannelService.INSTANCE.isRefusingWrites(channelSlot)) {
                OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(channelSlot.collectorSlot.unusedSlotCollectorSlot, ownSlot);
                return;
            }
        }
        this.releaseSlot(ownSlot, isEmpty);
    }

    private isReleasable(slot: TSlot): boolean {
        if (slot.holdCount > 0) return false;
        if (slot.owner !== this) return false;
        if (slot.columnSlotStore !== undefined) return false;
        return !this.slotContentStrategy.hasReference(slot);
    }

    private releaseSlot(slot: TSlot, isEmpty: boolean): void {
        if (!isEmpty) this.assertWritable(slot);
        this.slotContentStrategy.releaseSlotContent(slot, this);
        (slot as TOIMSlotEditable<TSlot>).slotFlags |= OIM_SLOT_FLAG_EMPTY;
        this.slotReleasePolicy.cancelSlotRelease(slot);
        const storeSlot = slot.storeSlot as TOIMStoreSlot<TStore, TSlot> | undefined;
        if (storeSlot !== undefined) this.slotStoreService.remove(storeSlot.store, slot.key);
        oimMarkSlotReleased(slot);
    }
}
