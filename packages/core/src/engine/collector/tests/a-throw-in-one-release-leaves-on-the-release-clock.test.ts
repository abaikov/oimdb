import {
    OIMDB, OIMReleaseSlotCollectorServiceAfterWrite, OIMReleaseSlotQueueService, OIMSlotReleasePolicyAfterWrite,
    createOIMEntityService, createOIMEntityWriterInPlace, oimIsSlotReleased,
} from '../../../index';
import type { IOIMEntityWriter } from '../../../index';

type TCard = { id: string };

describe('a throw in one release, in the middle of a slice of the release clock', () => {
    it('leaves the slots after it on the clock, and a later sweep releases them', () => {
        let nowMs = 0;
        const armedFor: number[] = [];
        const inPlace = createOIMEntityWriterInPlace();
        let refuse = true;
        const entityWriter: IOIMEntityWriter = {
            ...inPlace,
            clearEntity: slot => {
                if (refuse && slot.key === 'a') throw new Error('the clear of a threw');
                inPlace.clearEntity(slot);
            },
        };
        const db = new OIMDB({
            entityWriter,
            getNowMs: () => nowMs,
            releaseTimer: (_run, inMs) => { armedFor.push(inMs); return () => undefined; },
            slotReleasePolicy: new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 100 }),
        });
        const afterWriteReleaseSlotCollectorSlot = db.collectorSlot.afterWriteReleaseSlotCollectorSlot;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a' });
        const b = cardsService.slotContentService.upsertEntity(cards, { id: 'b' });
        db.flush();
        nowMs = 200;
        armedFor.length = 0;

        expect(() => { OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.flush(afterWriteReleaseSlotCollectorSlot); })
            .toThrow('the clear of a threw');
        expect(oimIsSlotReleased(b) || armedFor.length > 0).toBe(true);

        refuse = false;
        nowMs = 5000;
        OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.flush(afterWriteReleaseSlotCollectorSlot);

        expect(oimIsSlotReleased(b)).toBe(true);
        expect(OIMReleaseSlotQueueService.INSTANCE.isSlotReleaseScheduled(afterWriteReleaseSlotCollectorSlot, b)).toBe(false);
    });
});
