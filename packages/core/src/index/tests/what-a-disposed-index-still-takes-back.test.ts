import { OIMDB } from '../../db/OIMDB';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntityColumnName } from '../../entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService<
        TCard, TOIMStoreKey, readonly TOIMEntityColumnName<TCard>[], string,
        Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>, TOIMBucketSlotsSetStore<TCardSlot>,
        OIMSetBucketContentService<TCardSlot, string>
    >({
        entityService: cardsService,
        slotContentService: new OIMSetBucketContentService<TCardSlot, string>(),
        keyOf: (card: TCard) => card.deck,
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'x', title: 'ace' });
    return { db, byDeckService, byDeck };
};

describe('what a disposed index still takes back', () => {
    it('takes back every hold given out before the dispose, so a cleanup that runs after it does not throw', () => {
        const { byDeckService, byDeck } = createFixture();
        const bucket = byDeckService.holdSlotByKey(byDeck, 'x');
        const anyColumn = byDeckService.holdAnyBucketColumnByKey(byDeck, 'x');
        const column = byDeckService.holdBucketColumnByKey(byDeck, 'x', 'title');

        byDeckService.disposeIndexStoreSlot(byDeck);

        expect(() => {
            byDeckService.columnSlotService.unholdColumn(column);
            byDeckService.columnSlotService.unholdColumn(anyColumn);
            bucket.owner.unholdSlot(bucket);
        }).not.toThrow();
    });

    it('refuses every door that reads or takes', () => {
        const { byDeckService, byDeck } = createFixture();
        byDeckService.disposeIndexStoreSlot(byDeck);

        expect(() => byDeckService.getSlotByKey(byDeck, 'x')).toThrow(/disposed/);
        expect(() => byDeckService.holdSlotByKey(byDeck, 'x')).toThrow(/disposed/);
        expect(() => byDeckService.getEntitiesByKey(byDeck, 'x')).toThrow(/disposed/);
        expect(() => byDeckService.holdAnyBucketColumnByKey(byDeck, 'x')).toThrow(/disposed/);
        expect(() => byDeckService.holdBucketColumnByKey(byDeck, 'x', 'title')).toThrow(/disposed/);
    });
});
