import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMUnusedSlotCollectorSlot } from './types/TOIMUnusedSlotCollectorSlot';
import { oimUnholdSlotIfAlive } from '../slot/utils/oimUnholdSlotIfAlive';

export class OIMUnusedSlotCollectorService {
    public static readonly INSTANCE = new OIMUnusedSlotCollectorService();

    public holdSlotUntilFlush(unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot, slot: TOIMSlot): void {
        slot.owner.holdSlot(slot);
        unusedSlotCollectorSlot.unusedSlotChannelQueue.enqueueEntry(slot);
    }

    public flush(unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot): void {
        if (unusedSlotCollectorSlot.openDepth !== 0 || unusedSlotCollectorSlot.isFlushing) return;
        const unusedSlotChannelQueue = unusedSlotCollectorSlot.unusedSlotChannelQueue;
        if (unusedSlotChannelQueue.getEntryCount() === 0) return;
        let flushedCount = 0;
        unusedSlotCollectorSlot.isFlushing = true;
        try {
            while (flushedCount < unusedSlotChannelQueue.getEntryCount()) {
                const slot = unusedSlotChannelQueue.takeEntryAt(flushedCount++);
                if (slot !== undefined) oimUnholdSlotIfAlive(slot);
            }
        } finally {
            unusedSlotCollectorSlot.isFlushing = false;
            if (flushedCount === unusedSlotChannelQueue.getEntryCount()) unusedSlotChannelQueue.forgetTakenEntries();
        }
    }

    public open(unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot): void { unusedSlotCollectorSlot.openDepth++; }

    public close(unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot): void {
        if (unusedSlotCollectorSlot.openDepth === 0) {
            throw new Error(
                'OIMUnusedSlotCollectorService.close: no scope is open, so there is nothing to end. '
                + 'A close without its open would sweep slots an outer scope is standing on.',
            );
        }
        unusedSlotCollectorSlot.openDepth--;
        this.flush(unusedSlotCollectorSlot);
    }

    public run<TAnswer>(unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot, body: () => TAnswer): TAnswer {
        this.open(unusedSlotCollectorSlot);
        try {
            return body();
        } finally {
            this.close(unusedSlotCollectorSlot);
        }
    }
}
