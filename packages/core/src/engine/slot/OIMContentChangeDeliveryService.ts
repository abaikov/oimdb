import type { TOIMChannelSlot } from '../channel/types/TOIMChannelSlot';
import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import type { IOIMContentChangeListener } from './interfaces/IOIMContentChangeListener';
import type { OIMChannelQueue } from '../channel/OIMChannelQueue';
import { oimGetChannelQueueAtDepth } from '../channel/utils/oimGetChannelQueueAtDepth';
import { OIMChannelService } from '../channel/OIMChannelService';

export class OIMContentChangeDeliveryService {
    public static readonly INSTANCE = new OIMContentChangeDeliveryService();

    public isDeliveryDeferred(channelSlot: TOIMChannelSlot): boolean {
        return channelSlot.contentSubframeDepth > 0 || channelSlot.subframeDeliveryDepth > 0;
    }

    public openContentSubframe(channelSlot: TOIMChannelSlot): void {
        OIMChannelService.INSTANCE.openSubframe(channelSlot);
        channelSlot.contentSubframeDepth++;
    }

    public closeContentSubframe(channelSlot: TOIMChannelSlot): void {
        try {
            if (--channelSlot.contentSubframeDepth > 0 || channelSlot.subframeDeliveryDepth > 0) return;
            this.deliverEnqueuedContentChanges(channelSlot);
        } finally {
            OIMChannelService.INSTANCE.closeSubframe(channelSlot);
        }
    }

    public enqueueContentChange<TSlot extends TOIMSlot, TPatch>(
        channelSlot: TOIMChannelSlot, storeSlot: TOIMStoreSlot<unknown, TSlot, TPatch>,
        slot: TSlot, patch: TPatch | undefined, changedColumns: readonly string[] | undefined,
    ): void {
        const subframeDeliveryDepth = channelSlot.subframeDeliveryDepth;
        const subframeSlotChannelQueue = oimGetChannelQueueAtDepth(
            storeSlot.subframeSlotChannelQueues as OIMChannelQueue<TSlot>[], subframeDeliveryDepth,
        );
        if (subframeSlotChannelQueue.getEntryCount() === 0) {
            oimGetChannelQueueAtDepth(channelSlot.subframeStoreSlotChannelQueues, subframeDeliveryDepth).enqueueEntry(storeSlot as TOIMStoreSlot);
        }
        subframeSlotChannelQueue.enqueueEntry(slot);
        oimGetChannelQueueAtDepth(
            storeSlot.subframePatchChannelQueues as OIMChannelQueue<TPatch | undefined>[], subframeDeliveryDepth,
        ).enqueueEntry(patch);
        oimGetChannelQueueAtDepth(
            storeSlot.subframeChangedColumnsChannelQueues as OIMChannelQueue<readonly string[] | undefined>[], subframeDeliveryDepth,
        ).enqueueEntry(changedColumns === undefined ? undefined : changedColumns.slice());
    }

    public isLastEnqueuedSlot(channelSlot: TOIMChannelSlot, storeSlot: TOIMStoreSlot, slot: TOIMSlot): boolean {
        const subframeSlotChannelQueues = storeSlot.subframeSlotChannelQueues;
        if (subframeSlotChannelQueues === undefined) return false;
        const subframeSlotChannelQueue = subframeSlotChannelQueues[channelSlot.subframeDeliveryDepth];
        if (subframeSlotChannelQueue === undefined) return false;
        const subframeSlotCount = subframeSlotChannelQueue.getEntryCount();
        return subframeSlotCount !== 0 && subframeSlotChannelQueue.getEntryAt(subframeSlotCount - 1) === slot;
    }

    public deliverEnqueuedContentChanges(channelSlot: TOIMChannelSlot): void {
        const storeSlotChannelQueue = channelSlot.subframeStoreSlotChannelQueues[channelSlot.subframeDeliveryDepth];
        if (storeSlotChannelQueue === undefined || storeSlotChannelQueue.getEntryCount() === 0) return;
        this.deliverSubframeContentChanges(channelSlot, storeSlotChannelQueue);
    }

    private deliverSubframeContentChanges(channelSlot: TOIMChannelSlot, storeSlotChannelQueue: OIMChannelQueue<TOIMStoreSlot>): void {
        const subframeDeliveryDepth = channelSlot.subframeDeliveryDepth;
        channelSlot.subframeDeliveryDepth = subframeDeliveryDepth + 1;
        let isRefused = false;
        let refusal: unknown;
        try {
            for (let i = 0; i < storeSlotChannelQueue.getEntryCount(); i++) {
                try {
                    this.deliverStoreSlotContentChanges(storeSlotChannelQueue.getEntryAt(i), subframeDeliveryDepth);
                } catch (error) {
                    if (!isRefused) refusal = error;
                    isRefused = true;
                }
            }
            const nextStoreSlotChannelQueue = channelSlot.subframeStoreSlotChannelQueues[subframeDeliveryDepth + 1];
            if (nextStoreSlotChannelQueue !== undefined && nextStoreSlotChannelQueue.getEntryCount() !== 0) {
                try {
                    this.deliverSubframeContentChanges(channelSlot, nextStoreSlotChannelQueue);
                } catch (error) {
                    if (!isRefused) refusal = error;
                    isRefused = true;
                }
            }
        } finally {
            storeSlotChannelQueue.keepFirstEntries(0);
            channelSlot.subframeDeliveryDepth = subframeDeliveryDepth;
        }
        if (isRefused) throw refusal;
    }

    private deliverStoreSlotContentChanges(storeSlot: TOIMStoreSlot, subframeDeliveryDepth: number): void {
        const subframeSlotChannelQueue = (storeSlot.subframeSlotChannelQueues as OIMChannelQueue<TOIMSlot>[])[subframeDeliveryDepth];
        const subframePatchChannelQueue = (storeSlot.subframePatchChannelQueues as OIMChannelQueue<unknown>[])[subframeDeliveryDepth];
        const subframeChangedColumnsChannelQueue = (
            storeSlot.subframeChangedColumnsChannelQueues as OIMChannelQueue<readonly string[] | undefined>[]
        )[subframeDeliveryDepth];
        const listeners = storeSlot.contentChangeListeners as IOIMContentChangeListener<TOIMSlot, unknown>[];
        try {
            if (subframeSlotChannelQueue.getEntryCount() === 1) {
                const slot = subframeSlotChannelQueue.getEntryAt(0);
                const patch = subframePatchChannelQueue.getEntryAt(0);
                const changedColumns = subframeChangedColumnsChannelQueue.getEntryAt(0);
                for (let i = 0; i < listeners.length; i++) listeners[i].onContentChanged(slot, patch, changedColumns);
            } else {
                for (let i = 0; i < listeners.length; i++) {
                    listeners[i].onContentChangedMany(subframeSlotChannelQueue, subframePatchChannelQueue, subframeChangedColumnsChannelQueue);
                }
            }
        } finally {
            try {
                for (let i = 0; i < subframeSlotChannelQueue.getEntryCount(); i++) {
                    const slot = subframeSlotChannelQueue.getEntryAt(i);
                    slot.owner.releaseSlotIfUnheld(slot);
                }
            } finally {
                subframeSlotChannelQueue.keepFirstEntries(0);
                subframePatchChannelQueue.keepFirstEntries(0);
                subframeChangedColumnsChannelQueue.keepFirstEntries(0);
            }
        }
    }
}
