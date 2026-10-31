import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMInPlaceEntityWriter } from '../createOIMInPlaceEntityWriter';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMEntityContentService } from '../createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import type { OIMEntityContentService } from '../OIMEntityContentService';

type TCard = { id: string; title: string; deckId: string; rank: number };
type TCardsService = ReturnType<typeof createOIMSlotCollectionService<OIMEntityContentService<TCard>>>;

const asked = { columns: 0 };

const createFixture =(): {
    db: OIMDB;
    effectService: OIMEffectService;
    cardsService: TCardsService;
    cards: ReturnType<TCardsService['createStoreSlot']>;
} => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    asked.columns = 0;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, TOIMStoreKey>({ entityWriter: createOIMInPlaceEntityWriter({
            sameValueGuard: (prev, next) => {
                asked.columns++;
                return prev === next;
            },
        }) }) });
    const cards = cardsService.createStoreSlot(db);
    return { db, effectService, cardsService, cards };
};

const aCard = (id: string, title: string): TCard =>
    ({ id, title, deckId: 'd1', rank: 1 });

describe('what a write asks about columns nobody subscribed to', () => {
    it('compares no column at all on a key the store does not hold', () => {
        const { db, cardsService, cards } = createFixture();

        for (let i = 0; i < 100; i++) cardsService.writeSlotContentByKey(cards, (aCard(`c${i}`, 'A')).id, aCard(`c${i}`, 'A'));
        db.flush();

        expect(asked.columns).toBe(0);
    });

    it('compares each column once and never twice', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, (aCard('c1', 'A')).id, aCard('c1', 'A'));
        db.flush();
        asked.columns = 0;

        cardsService.writeSlotContentByKey(cards, (aCard('c1', 'B')).id, aCard('c1', 'B'));
        db.flush();

        expect(asked.columns).toBe(4);
    });

    it('compares a batch once per column per row, so the count is the population', () => {
        const { db, cardsService, cards } = createFixture();
        for (let i = 0; i < 100; i++) cardsService.writeSlotContentByKey(cards, (aCard(`c${i}`, 'A')).id, aCard(`c${i}`, 'A'));
        db.flush();
        asked.columns = 0;

        for (let i = 0; i < 100; i++) cardsService.writeSlotContentByKey(cards, (aCard(`c${i}`, 'B')).id, aCard(`c${i}`, 'B'));
        db.flush();

        expect(asked.columns).toBe(400);
    });

    it('mints no column identity for a row nobody watches by column', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, (aCard('c1', 'A')).id, aCard('c1', 'A'));
        db.flush();

        cardsService.writeSlotContentByKey(cards, (aCard('c1', 'B')).id, aCard('c1', 'B'));
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'c1').columnSlotStore).toBeUndefined();
    });

    it('asks about them once a column is subscribed, and wakes only that one', () => {
        const { db, effectService, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, (aCard('c1', 'A')).id, aCard('c1', 'A'));
        db.flush();
        const slot = cardsService.getSlotByKey(cards, 'c1');
        const title =cardsService.columnSlotService.holdColumn(slot, 'title');
        const rank = cardsService.columnSlotService.holdColumn(slot, 'rank');
        let titleWoke = 0;
        let rankWoke = 0;
        effectService.createEffect(db, () => { titleWoke++; }, [title]);
        effectService.createEffect(db, () => { rankWoke++; }, [rank]);
        db.flush();
        titleWoke = 0;
        rankWoke = 0;
        asked.columns = 0;

        cardsService.writeSlotContentByKey(cards, (aCard('c1', 'B')).id, aCard('c1', 'B'));
        db.flush();

        expect(asked.columns).toBeGreaterThan(0);
        expect({ titleWoke, rankWoke }).toEqual({ titleWoke: 1, rankWoke: 0 });
    });

    it('still reports the row itself changed when nobody watches a column', () => {
        const { db, effectService, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, (aCard('c1', 'A')).id, aCard('c1', 'A'));
        db.flush();
        const slot = cardsService.getSlotByKey(cards, 'c1');
        let rowWoke = 0;
        effectService.createEffect(db, () => { rowWoke++; }, [slot]);
        db.flush();
        rowWoke = 0;

        cardsService.writeSlotContentByKey(cards, (aCard('c1', 'B')).id, aCard('c1', 'B'));
        db.flush();

        expect(rowWoke).toBe(1);
        expect(slot.entity?.title).toBe('B');
    });

    it('tells an unchanged write from a changed one without a column subscriber', () => {
        const { db, effectService, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, (aCard('c1', 'A')).id, aCard('c1', 'A'));
        db.flush();
        const slot = cardsService.getSlotByKey(cards, 'c1');
        let rowWoke = 0;
        effectService.createEffect(db, () => { rowWoke++; }, [slot]);
        db.flush();
        rowWoke = 0;

        cardsService.writeSlotContentByKey(cards, (aCard('c1', 'A')).id, aCard('c1', 'A'));
        db.flush();

        expect(rowWoke).toBe(0);
    });
});
