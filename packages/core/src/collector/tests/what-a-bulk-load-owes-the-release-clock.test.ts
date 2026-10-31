import { OIMDB, OIMSlotAfterIdleReleasePolicy, oimMintAfterIdleSlotReleaseWheel } from '../../index';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const WINDOW = 30_000;
const START = 1_000_000;

const createFixture =() => {
    let ms = START;
    const db = new OIMDB({ getNowMs: () => ms, releaseTimer: () => () => undefined });
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, string>(), slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: WINDOW }) });
    const cards = cardsService.createStoreSlot(db);
    return { db, afterIdleSlotReleaseWheel: oimMintAfterIdleSlotReleaseWheel(db.collectorSlot), cardsService, cards, at: (value: number): void => { ms = value; } };
};

describe('a population loaded in bulk', () => {
    it('is on the release clock, exactly as one written key by key is', () => {
        const bulk = createFixture();
        bulk.cardsService.writeInBatch(bulk.cards, () => ([{ id: 'c1', title: 'one' }, { id: 'c2', title: 'two' }]).map(entity => bulk.cardsService.writeSlotContentByKey(bulk.cards, entity.id, entity)));
        bulk.db.flush();

        expect(bulk.afterIdleSlotReleaseWheel.isSlotReleaseScheduled(bulk.cardsService.getSlotByKey(bulk.cards, 'c1'))).toBe(true);
        expect(bulk.afterIdleSlotReleaseWheel.isSlotReleaseScheduled(bulk.cardsService.getSlotByKey(bulk.cards, 'c2'))).toBe(true);
    });

    it('expires on its window, which a population off the clock never would', () => {
        const bulk = createFixture();
        bulk.cardsService.writeInBatch(bulk.cards, () => ([{ id: 'c1', title: 'one' }, { id: 'c2', title: 'two' }]).map(entity => bulk.cardsService.writeSlotContentByKey(bulk.cards, entity.id, entity)));
        bulk.db.flush();

        bulk.at(START + WINDOW + 1_000);
        bulk.afterIdleSlotReleaseWheel.flush();

        expect(bulk.cardsService.getSlotCount(bulk.cards)).toBe(0);
    });
});
