import { OIMDB } from '../../../factories/OIMDB';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import { createOIMSlotCollectionIndexService } from '../../../factories/createOIMSlotCollectionIndexService';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService<
        TCard, TOIMStoreKey, readonly TOIMEntityColumnName<TCard>[], string,
        Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>, TOIMBucketSlotsSetStore<TCardSlot>,
        OIMSlotContentSetBucketService<TCardSlot, string>
    >(db, {
        entityService: cardsService,
        slotContentService: new OIMSlotContentSetBucketService<TCardSlot, string>(),
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
