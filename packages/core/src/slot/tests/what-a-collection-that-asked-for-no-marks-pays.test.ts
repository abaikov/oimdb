import { OIMDB, OIMSlotAfterWriteReleasePolicy } from '../../index';
import type { IOIMSlotReleasePolicy, TOIMDBOptions } from '../../index';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const cardsWith = (slotReleasePolicy?: IOIMSlotReleasePolicy, dbOptions?: TOIMDBOptions) => {
    const db = new OIMDB(dbOptions);
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, string>(), slotReleasePolicy });
    const cards = cardsService.createStoreSlot(db);
    return { db, cards, cardsService };
};

describe('what a collection that asked for no marks pays', () => {
    it('does not read the clock once, over a mint and a hundred writes', () => {
        const world = cardsWith();

        const card = world.cardsService.writeSlotContentByKey(world.cards, 'c1', { id: 'c1', title: 'one' });
        for (let i = 0; i < 100; i++) world.cardsService.slotContentService.updateEntity(card, { title: `t${i}` });
        world.db.flush();

        expect(world.cardsService.getSlotByKey(world.cards, 'c1')?.releaseDueAfterWriteMs).toBe(-1);
    });

    it('reads it on every write once a mark was asked for, which is what the mark costs', () => {
        let readings = 0;
        const world = cardsWith(new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 0 }), {
            getNowMs: () => { readings++; return 1_000; },
            releaseTimer: () => () => undefined,
        });

        const card = world.cardsService.writeSlotContentByKey(world.cards, 'c1', { id: 'c1', title: 'one' });
        const afterFirst = readings;
        world.cardsService.slotContentService.updateEntity(card, { title: 'two' });

        expect(afterFirst).toBeGreaterThan(0);
        expect(readings).toBeGreaterThan(afterFirst);
        expect(world.cardsService.getSlotByKey(world.cards, 'c1')?.releaseDueAfterWriteMs).toBe(1_000);
    });
});
