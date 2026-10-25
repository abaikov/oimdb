import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMSlotEditable } from './types/TOIMSlotEditable';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import type { IOIMContentChangeListener } from './interfaces/IOIMContentChangeListener';
import { OIMChannelQueue } from '../channel/OIMChannelQueue';

export class OIMContentChangeDeliveryService {
    public static readonly INSTANCE = new OIMContentChangeDeliveryService();

    public isBatchOpen(storeSlot: TOIMStoreSlot): boolean {
        return storeSlot.batchDepth > 0;
    }

    public openBatch(storeSlot: TOIMStoreSlot): void {
        (storeSlot as TOIMSlotEditable<TOIMStoreSlot>).batchDepth++;
    }

    public closeBatch(storeSlot: TOIMStoreSlot): void {
        const storeSlotEditable = storeSlot as TOIMSlotEditable<TOIMStoreSlot>;
        if (--storeSlotEditable.batchDepth > 0) return;
        const batchSlotChannelQueue = storeSlot.batchSlotChannelQueue;
        if (batchSlotChannelQueue === undefined || batchSlotChannelQueue.getEntryCount() === 0) return;
        this.deliverBatch(storeSlot, batchSlotChannelQueue);
    }

    public enqueueContentChange<TSlot extends TOIMSlot, TPatch>(
        storeSlot: TOIMStoreSlot<unknown, TSlot, TPatch>, slot: TSlot, patch: TPatch | undefined, changedColumns: readonly string[] | undefined,
    ): void {
        const storeSlotEditable = storeSlot as TOIMSlotEditable<TOIMStoreSlot<unknown, TSlot, TPatch>>;
        (storeSlotEditable.batchSlotChannelQueue ??= new OIMChannelQueue<TSlot>()).enqueueEntry(slot);
        (storeSlotEditable.batchPatchChannelQueue ??= new OIMChannelQueue<TPatch | undefined>()).enqueueEntry(patch);
        (storeSlotEditable.batchChangedColumnsChannelQueue ??= new OIMChannelQueue<readonly string[] | undefined>())
            .enqueueEntry(changedColumns === undefined ? undefined : changedColumns.slice());
    }

    public isLastEnqueuedSlot(storeSlot: TOIMStoreSlot, slot: TOIMSlot): boolean {
        const batchSlotChannelQueue = storeSlot.batchSlotChannelQueue;
        if (batchSlotChannelQueue === undefined) return false;
        const batchSlotCount = batchSlotChannelQueue.getEntryCount();
        return batchSlotCount !== 0 && batchSlotChannelQueue.getEntryAt(batchSlotCount - 1) === slot;
    }

    private deliverBatch(storeSlot: TOIMStoreSlot, batchSlotChannelQueue: OIMChannelQueue<TOIMSlot>): void {
        const batchPatchChannelQueue = storeSlot.batchPatchChannelQueue as OIMChannelQueue<unknown>;
        const batchChangedColumnsChannelQueue = storeSlot.batchChangedColumnsChannelQueue as OIMChannelQueue<readonly string[] | undefined>;
        const listeners = storeSlot.contentChangeListeners as IOIMContentChangeListener<TOIMSlot, unknown>[] | undefined;
        try {
            if (listeners === undefined) return;
            if (batchSlotChannelQueue.getEntryCount() === 1) {
                const slot = batchSlotChannelQueue.getEntryAt(0);
                const patch = batchPatchChannelQueue.getEntryAt(0);
                const changedColumns = batchChangedColumnsChannelQueue.getEntryAt(0);
                for (let i = 0; i < listeners.length; i++) listeners[i].onContentChanged(slot, patch, changedColumns);
            } else {
                for (let i = 0; i < listeners.length; i++) {
                    listeners[i].onContentChangedMany(batchSlotChannelQueue, batchPatchChannelQueue, batchChangedColumnsChannelQueue);
                }
            }
        } finally {
            try {
                for (let i = 0; i < batchSlotChannelQueue.getEntryCount(); i++) {
                    const slot = batchSlotChannelQueue.getEntryAt(i);
                    slot.owner.releaseSlotIfUnheld(slot);
                }
            } finally {
                batchSlotChannelQueue.keepFirstEntries(0);
                batchPatchChannelQueue.keepFirstEntries(0);
                batchChangedColumnsChannelQueue.keepFirstEntries(0);
            }
        }
    }
}
