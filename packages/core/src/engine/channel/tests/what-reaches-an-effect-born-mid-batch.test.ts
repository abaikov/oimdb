import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMEffectService } from '../../../index';

type TCard = { id: string; title: string; rank: number };

const effectService = OIMEffectService.INSTANCE;

const makeCards = (db: OIMDB) => {
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card) => card.id });
    return { cardsService, cards: cardsService.createStoreSlot(db) };
};

describe('what reaches an effect born in the middle of an open batch', () => {
    it('owes it nothing for the write it was built behind', () => {
        const db = new OIMDB();
        const { cardsService, cards } = makeCards(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;

        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });
        db.flush();

        expect(runs).toBe(0);
    });

    it('still delivers a write made after it, in that same batch', () => {
        const db = new OIMDB();
        const { cardsService, cards } = makeCards(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;

        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A moved', rank: 2 });
        db.flush();

        expect(runs).toBe(1);
        expect(slot.entity?.title).toBe('A moved');
    });

    it('delivers to a column minted behind its row write when that column is written next', () => {
        const db = new OIMDB();
        const { cardsService, cards } = makeCards(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        db.flush();
        const slot = cardsService.getSlotByKey(cards, 'a')!;

        cardsService.slotContentService.updateEntity(slot, { title: 'A moved' });
        const rank = cardsService.holdColumn(slot, 'rank');
        let runCount = 0;
        effectService.createEffect(db, [rank], [], () => { runCount++; });
        cardsService.slotContentService.updateEntity(slot, { rank: 2 });
        db.flush();

        expect(runCount).toBe(1);
    });

    it('hands a caller who wants the value now exactly one run, and no second one', () => {
        const db = new OIMDB();
        const { cardsService, cards } = makeCards(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;

        const seen: (string | undefined)[] = [];
        effectService.createEffectImmediate(db, [slot], [], () => { seen.push(slot.entity?.title); });
        db.flush();

        expect(seen).toEqual(['A']);
    });
});
