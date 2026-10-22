import {
    OIMDB,
    OIMReleaseSlotCollectorServiceAfterIdle,
    OIMReleaseSlotQueueService,
    OIMSlotReleasePolicyAfterIdle,
    createOIMEntityService,
} from '../../../index';

type TCard = { id: string; title: string };

const WINDOW = 30_000;
const START = 1_000_000;

const createFixture =() => {
    let ms = START;
    const db = new OIMDB({ getNowMs: () => ms, releaseTimer: () => () => undefined });
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: WINDOW }),
    });
    const cards = cardsService.createStoreSlot(db);
    return { db, afterIdleReleaseSlotCollectorSlot: db.collectorSlot.afterIdleReleaseSlotCollectorSlot, cardsService, cards, at: (value: number): void => { ms = value; } };
};

describe('a population loaded in bulk', () => {
    it('is on the release clock, exactly as one written key by key is', () => {
        const bulk = createFixture();
        bulk.cardsService.slotContentService.insertEntities(bulk.cards, [{ id: 'c1', title: 'one' }, { id: 'c2', title: 'two' }]);
        bulk.db.flush();

        expect(OIMReleaseSlotQueueService.INSTANCE.isSlotReleaseScheduled(bulk.afterIdleReleaseSlotCollectorSlot, bulk.cardsService.getSlotByKey(bulk.cards, 'c1'))).toBe(true);
        expect(OIMReleaseSlotQueueService.INSTANCE.isSlotReleaseScheduled(bulk.afterIdleReleaseSlotCollectorSlot, bulk.cardsService.getSlotByKey(bulk.cards, 'c2'))).toBe(true);
    });

    it('expires on its window, which a population off the clock never would', () => {
        const bulk = createFixture();
        bulk.cardsService.slotContentService.insertEntities(bulk.cards, [{ id: 'c1', title: 'one' }, { id: 'c2', title: 'two' }]);
        bulk.db.flush();

        bulk.at(START + WINDOW + 1_000);
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(bulk.afterIdleReleaseSlotCollectorSlot);

        expect(bulk.cardsService.getSlotCount(bulk.cards)).toBe(0);
    });
});
