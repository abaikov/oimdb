import { OIMDB, OIMEffectService, OIMSetBucketContentService, createOIMSlotCollectionIndexService } from '../../index';
import type { TOIMEntitySlot } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; deck: string };

describe('what clearing every slot at once wakes', () => {
    it('runs an effect over every slot once per clear, on the half-cleared state, under a scheduler that runs at once', () => {
        const db = new OIMDB({ channelScheduler: run => { run(); } });
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const ids = ['a', 'b', 'c', 'd'];
        for (const id of ids) cardsService.writeSlotContentByKey(cards, id, { id, deck: 'x' });
        const cardSlots = ids.map(id => cardsService.holdSlotByKey(cards, id));
        const seen: string[] = [];
        OIMEffectService.INSTANCE.createEffect(db, () => {
            seen.push(cardSlots.map(cardSlot => (cardSlot.entity === undefined ? '-' : cardSlot.key)).join(''));
        }, cardSlots);
        seen.length = 0;

        cardsService.writeInBatch(cards, () => { for (const entitySlot of [...cardsService.getSlots(cards)]) cardsService.slotContentService.clearSlotContent(entitySlot); });

        expect(seen).toEqual(['-bcd', '--cd', '---d', '----']);
    });

    it('runs an effect over every slot once when the clears are flushed by hand', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const ids = ['a', 'b', 'c', 'd'];
        for (const id of ids) cardsService.writeSlotContentByKey(cards, id, { id, deck: 'x' });
        const cardSlots = ids.map(id => cardsService.holdSlotByKey(cards, id));
        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { runs++; }, cardSlots);
        db.flush();
        runs = 0;

        cardsService.writeInBatch(cards, () => { for (const entitySlot of [...cardsService.getSlots(cards)]) cardsService.slotContentService.clearSlotContent(entitySlot); });
        db.flush();

        expect(runs).toBe(1);
    });

    it('shows an index bucket emptied in the one frame it wakes', () => {
        const db = new OIMDB({ channelScheduler: run => { run(); } });
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService({
            entityService: cardsService,
            selectKey: (card: TCard) => card.deck,
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        for (const id of ['a', 'b']) cardsService.writeSlotContentByKey(cards, id, { id, deck: 'x' });
        const deck = byDeckService.holdSlotByKey(byDeck, 'x');
        const seen: number[] = [];
        OIMEffectService.INSTANCE.createEffect(db, () => { seen.push(byDeckService.getEntitiesByKey(byDeck, 'x').length); }, [deck]);
        seen.length = 0;

        cardsService.writeInBatch(cards, () => { for (const entitySlot of [...cardsService.getSlots(cards)]) cardsService.slotContentService.clearSlotContent(entitySlot); });

        expect(seen).toEqual([0]);
    });
});
