import { OIMDB, OIMSlotAfterWriteReleasePolicy, oimIsSlotReleased, oimMintAfterWriteSlotReleaseWheel } from '../../../index';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const START = 1_000_000;

/** The write-age window: every update puts the identity back at the far end of it. */
const createAgingFixture = (after: number) => {
    let ms = START;
    const db = new OIMDB({ getNowMs: () => ms, releaseTimer: () => () => undefined });
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db), slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: after }) });
    const cards = cardsService.createStoreSlot(db);
    return {
        db,
        flushAfterWrite: (): void => {
            oimMintAfterWriteSlotReleaseWheel(db.collectorSlot).flush();
        },
        cardsService,
        cards,
        at: (value: number): void => { ms = value; },
    };
};

describe('a row condemned while something still referred to it', () => {
    it('is not still condemned after it has been written again', () => {
        const fixture =createAgingFixture(30_000);
        const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();
        slot.owner.holdSlot(slot);

        // CONDEMNED UNDER A LIVE REFERENCE. The hold is what keeps it, and the
        // mark is on the slot from here on.
        fixture.at(START + 31_000);
        fixture.flushAfterWrite();
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')).toBe(slot);

        // A ROW OF AGE ZERO — and, before the mark was lifted, one that vanished
        // the moment the hold was given back.
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'two' });
        fixture.db.flush();

        slot.owner.unholdSlot(slot);
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')).toBe(slot);
        expect(slot.entity).toEqual({ id: 'c1', title: 'two' });
    });

    it('gets a WHOLE window from that write, and goes when it runs out', () => {
        const fixture =createAgingFixture(30_000);
        const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();
        slot.owner.holdSlot(slot);

        fixture.at(START + 31_000);
        fixture.flushAfterWrite();
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'two' });
        fixture.db.flush();
        slot.owner.unholdSlot(slot);

        // 31s after the condemnation and 0s after the write that lifted it.
        fixture.flushAfterWrite();
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')).toBe(slot);

        // And the window is not waived: it runs from the write.
        fixture.at(START + 31_000 + 31_000);
        fixture.flushAfterWrite();
        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });
});
