import { OIMDB, OIMSlotAfterWriteReleasePolicy, createOIMInPlaceEntityWriter, oimIsSlotReleased, oimMintAfterWriteSlotReleaseWheel } from '../../index';
import type { IOIMEntityWriter } from '../../index';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string };

describe('a throw in one release, in the middle of a slice of the release clock', () => {
    it('leaves the slots after it on the clock, and a later sweep releases them', () => {
        let nowMs = 0;
        const armedFor: number[] = [];
        const inPlace = createOIMInPlaceEntityWriter();
        let refuse = true;
        const entityWriter: IOIMEntityWriter = {
            ...inPlace,
            clearEntity: slot => {
                if (refuse && (slot.entity as TCard | undefined)?.id === 'a') throw new Error('the clear of a threw');
                inPlace.clearEntity(slot);
            },
        };
        const db = new OIMDB({
            entityWriter,
            getNowMs: () => nowMs,
            releaseTimer: (_run, inMs) => { armedFor.push(inMs); return () => undefined; },
            slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 100 }),
        });
        const afterWriteSlotReleaseWheel = oimMintAfterWriteSlotReleaseWheel(db.collectorSlot);
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
        const cards = cardsService.createStoreSlot(db);
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a' });
        const b = cardsService.writeSlotContentByKey(cards, 'b', { id: 'b' });
        db.flush();
        nowMs = 200;
        armedFor.length = 0;

        expect(() => { afterWriteSlotReleaseWheel.flush(); })
            .toThrow('the clear of a threw');
        expect(oimIsSlotReleased(b) || armedFor.length > 0).toBe(true);

        refuse = false;
        nowMs = 5000;
        afterWriteSlotReleaseWheel.flush();

        expect(oimIsSlotReleased(b)).toBe(true);
        expect(afterWriteSlotReleaseWheel.isSlotReleaseScheduled(b)).toBe(false);
    });
});
