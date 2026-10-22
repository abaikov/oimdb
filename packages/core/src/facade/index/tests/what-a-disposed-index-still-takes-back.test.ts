import { OIMDB } from '../../../factories/OIMDB';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMIndexService<
        TCard, TOIMStoreKey, readonly TOIMEntityColumnName<TCard>[], string,
        Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>, TOIMBucketSlotsSetStore<TCardSlot>,
        OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, {
        entityService: cardsService,
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
        keyOf: (card: TCard) => card.deck,
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    cardsService.slotContentService.upsertEntity(cards, { id: 'a', deck: 'x', title: 'ace' });
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
            byDeckService.unholdColumn(column);
            byDeckService.unholdColumn(anyColumn);
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
