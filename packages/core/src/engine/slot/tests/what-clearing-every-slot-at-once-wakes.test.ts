import {
    OIMDB, OIMEffectService, OIMSlotContentBucketServiceSetDriven, createOIMEntityService, createOIMIndexService,
} from '../../../index';
import type { TOIMEntitySlot } from '../../../index';

type TCard = { id: string; deck: string };

describe('what clearing every slot at once wakes', () => {
    it('runs an effect over every row once, not once per row, under a scheduler that runs at once', () => {
        const db = new OIMDB({ channelScheduler: run => { run(); } });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const ids =['a', 'b', 'c', 'd'];
        for (const id of ids) cardsService.slotContentService.upsertEntity(cards, { id, deck: 'x' });
        const rowSlots = ids.map(id => cardsService.holdSlotByKey(cards, id));
        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, rowSlots, [], () => { runs++; });
        runs = 0;

        cardsService.slotContentService.clearAllEntities(cards);

        expect(runs).toBe(1);
    });

    it('shows an index bucket emptied in the one frame it wakes', () => {
        const db = new OIMDB({ channelScheduler: run => { run(); } });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        for (const id of ['a', 'b']) cardsService.slotContentService.upsertEntity(cards, { id, deck: 'x' });
        const deck = byDeckService.holdSlotByKey(byDeck, 'x');
        const seen: number[] = [];
        OIMEffectService.INSTANCE.createEffect(db, [deck], [], () => { seen.push(byDeckService.getEntitiesByKey(byDeck, 'x').length); });
        seen.length = 0;

        cardsService.slotContentService.clearAllEntities(cards);

        expect(seen).toEqual([0]);
    });
});
