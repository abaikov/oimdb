import {
    OIMDB, OIMSlotContentBucketServiceSetDriven, createOIMEntityService, createOIMIndexService,
} from '../../../index';
import type { TOIMEntitySlot } from '../../../index';

type TCard = { id: string; deck: string; title: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byTitleService = createOIMIndexService(db, {
        entityService: cardsService,
        keyOf: (card: TCard) => {
            if (card.title === 'bad') throw new Error('keyOf refused this row');
            return card.title;
        },
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
    });
    const byTitle = byTitleService.createIndexStoreSlot(cards);
    byTitleService.holdSlotByKey(byTitle, 'good');
    byTitleService.holdSlotByKey(byTitle, 'ok');
    return { cardsService, cards, byTitleService, byTitle };
};

const idsUnder = (
    byTitleService: ReturnType<typeof createFixture>['byTitleService'],
    byTitle: ReturnType<typeof createFixture>['byTitle'],
    key: string,
): string[] =>
    byTitleService.getEntitiesByKey(byTitle, key).map(card => card?.id ?? '?').sort();

describe('what an index keeps when its key throws in the middle of a batch', () => {
    it('files every row of the batch it accepted, and throws once the batch is through', () => {
        const { cardsService, cards, byTitleService, byTitle } = createFixture();

        expect(() => cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deck: 'spades', title: 'bad' },
            { id: 'c2', deck: 'spades', title: 'good' },
        ])).toThrow('keyOf refused this row');

        expect(idsUnder(byTitleService, byTitle, 'good')).toEqual(['c2']);
    });

    it('takes a row it refused out of the bucket its old key named', () => {
        const { cardsService, cards, byTitleService, byTitle } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'ok' });

        expect(() => cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'clubs', title: 'bad' })).toThrow('keyOf refused this row');

        expect(idsUnder(byTitleService, byTitle, 'ok')).toEqual([]);
    });

    it('files that row again at the next write it accepts', () => {
        const { cardsService, cards, byTitleService, byTitle } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'ok' });
        expect(() => cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'clubs', title: 'bad' })).toThrow();

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'clubs', title: 'good' });

        expect(idsUnder(byTitleService, byTitle, 'good')).toEqual(['c1']);
    });
});
