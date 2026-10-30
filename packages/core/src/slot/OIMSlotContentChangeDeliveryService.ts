import type { TOIMSlot } from './types/TOIMSlot';
import type { TOIMEditable } from './types/TOIMEditable';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import type { IOIMSlotContentChangeListener } from './interfaces/IOIMSlotContentChangeListener';
import { OIMChannelQueue } from '../channel/OIMChannelQueue';
import { OIM_SLOT_FLAG_QUEUED_IN_BATCH } from './constants/OIM_SLOT_FLAG_QUEUED_IN_BATCH';

export class OIMSlotContentChangeDeliveryService {
    public static readonly INSTANCE = new OIMSlotContentChangeDeliveryService();

    public isBatchOpen(storeSlot: TOIMStoreSlot): boolean {
        return storeSlot.batchDepth > 0;
    }

    public openBatch(storeSlot: TOIMStoreSlot): void {
        (storeSlot as TOIMEditable<TOIMStoreSlot>).batchDepth++;
    }

    public closeBatch(storeSlot: TOIMStoreSlot): void {
        const editableStoreSlot = storeSlot as TOIMEditable<TOIMStoreSlot>;
        if (editableStoreSlot.batchDepth === 0) {
            throw new Error(
                'OIMSlotContentChangeDeliveryService.closeBatch: no batch is open on this store slot, so there is nothing to close. '
                + 'A close without its open would leave the next batch delivering every write at once.',
            );
        }
        if (--editableStoreSlot.batchDepth > 0) return;
        const batchSlotChannelQueue = storeSlot.batchSlotChannelQueue;
        if (batchSlotChannelQueue === undefined || batchSlotChannelQueue.getEntryCount() === 0) return;
        this.deliverBatch(storeSlot, batchSlotChannelQueue);
    }

    public enqueueContentChange<TSlot extends TOIMSlot, TPatch>(
        storeSlot: TOIMStoreSlot<unknown, TSlot, TPatch>, slot: TSlot, patch: TPatch | undefined, changedColumns: readonly string[] | undefined,
    ): void {
        const editableStoreSlot = storeSlot as TOIMEditable<TOIMStoreSlot<unknown, TSlot, TPatch>>;
        (editableStoreSlot.batchSlotChannelQueue ??= new OIMChannelQueue<TSlot>()).enqueueEntry(slot);
        (slot as TOIMEditable<TSlot>).slotFlags |= OIM_SLOT_FLAG_QUEUED_IN_BATCH;
        (editableStoreSlot.batchPatchChannelQueue ??= new OIMChannelQueue<TPatch | undefined>()).enqueueEntry(patch);
        (editableStoreSlot.batchChangedColumnsChannelQueue ??= new OIMChannelQueue<readonly string[] | undefined>())
            .enqueueEntry(changedColumns === undefined ? undefined : changedColumns.slice());
    }

    private deliverBatch(storeSlot: TOIMStoreSlot, batchSlotChannelQueue: OIMChannelQueue<TOIMSlot>): void {
        const batchPatchChannelQueue = storeSlot.batchPatchChannelQueue as OIMChannelQueue<unknown>;
        const batchChangedColumnsChannelQueue = storeSlot.batchChangedColumnsChannelQueue as OIMChannelQueue<readonly string[] | undefined>;
        const listeners = storeSlot.contentChangeListeners as IOIMSlotContentChangeListener<TOIMSlot, unknown>[] | undefined;
        try {
            if (listeners === undefined) return;
            if (batchSlotChannelQueue.getEntryCount() === 1) {
                const slot = batchSlotChannelQueue.getEntryAt(0);
                const patch = batchPatchChannelQueue.getEntryAt(0);
                const changedColumns = batchChangedColumnsChannelQueue.getEntryAt(0);
                for (let i = 0; i < listeners.length; i++) listeners[i].onContentChanged(slot, patch, changedColumns);
            } else {
                for (let i = 0; i < listeners.length; i++) {
                    listeners[i].onManyContentsChanged(batchSlotChannelQueue, batchPatchChannelQueue, batchChangedColumnsChannelQueue);
                }
            }
        } finally {
            for (let i = 0; i < batchSlotChannelQueue.getEntryCount(); i++) {
                (batchSlotChannelQueue.getEntryAt(i) as TOIMEditable<TOIMSlot>).slotFlags &= ~OIM_SLOT_FLAG_QUEUED_IN_BATCH;
            }
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
