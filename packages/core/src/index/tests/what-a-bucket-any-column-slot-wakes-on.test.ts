import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMColumnName } from '../../column/types/TOIMColumnName';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

function setUp() {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    cardsService.writeInBatch(cards, () => ([
        { id: 'c1', deck: 'spades', title: 'Ace' },
        { id: 'c2', deck: 'spades', title: 'King' },
        { id: 'c3', deck: 'hearts', title: 'Queen' },
    ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
    const byDeckService = createOIMSlotCollectionIndexService<
        TCard, TOIMStoreKey, readonly TOIMColumnName<TCard>[], string,
        Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>, TOIMBucketSlotsSetStore<TCardSlot>,
        OIMSetBucketContentService<TCardSlot, string>
    >({
        entityService: cardsService,
        slotContentService: new OIMSetBucketContentService<TCardSlot, string>(),
        keyOf: card => card.deck,
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const updateTitleOf = (key: string, patch: Partial<TCard>): void => {
        const slot = cardsService.peekSlotByKey(cards, key);
        if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
    };
    return { db, effectService, cardsService, cards, byDeckService, byDeck, updateTitleOf };
}

describe('the any-column slot of an index bucket', () => {
    it('wakes on a write to a member that stays in its bucket, where the bucket does not', () => {
        const { db, effectService, byDeckService, byDeck, updateTitleOf } = setUp();
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnSlotByKey(byDeck, 'spades');
        let bucketRuns = 0;
        let anyColumnRuns = 0;
        effectService.createEffect(db, () => { bucketRuns++; }, [spades]);
        effectService.createEffect(db, () => { anyColumnRuns++; }, [spadesAnyColumn]);

        updateTitleOf('c1', { title: 'Ace of Spades' });
        db.flush();

        expect(bucketRuns).toBe(0);
        expect(anyColumnRuns).toBe(1);
    });

    it('wakes on a member joining or leaving too, since its value lists the members', () => {
        const { db, effectService, byDeckService, byDeck, updateTitleOf } = setUp();
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnSlotByKey(byDeck, 'spades');
        let bucketRuns = 0;
        let anyColumnRuns = 0;
        effectService.createEffect(db, () => { bucketRuns++; }, [spades]);
        effectService.createEffect(db, () => { anyColumnRuns++; }, [spadesAnyColumn]);

        updateTitleOf('c3', { deck: 'spades' });
        db.flush();
        updateTitleOf('c1', { deck: 'hearts' });
        db.flush();

        expect(bucketRuns).toBe(2);
        expect(anyColumnRuns).toBe(2);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(card => card?.id).sort()).toEqual(['c2', 'c3']);
    });

    it('stays silent for a write to a member of another bucket', () => {
        const { db, effectService, byDeckService, byDeck, updateTitleOf } = setUp();
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnSlotByKey(byDeck, 'spades');
        let anyColumnRuns = 0;
        effectService.createEffect(db, () => { anyColumnRuns++; }, [spadesAnyColumn]);

        updateTitleOf('c3', { title: 'Queen of Hearts' });
        db.flush();

        expect(anyColumnRuns).toBe(0);
    });

    it('wakes once for many in-place writes in one batch', () => {
        const { db, effectService, cardsService, cards, byDeckService, byDeck } = setUp();
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnSlotByKey(byDeck, 'spades');
        let anyColumnRuns = 0;
        effectService.createEffect(db, () => { anyColumnRuns++; }, [spadesAnyColumn]);

        cardsService.writeInBatch(cards, () => ([
            { id: 'c1', deck: 'spades', title: 'Ace of Spades' },
            { id: 'c2', deck: 'spades', title: 'King of Spades' },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();

        expect(anyColumnRuns).toBe(1);
    });

    it('keeps its bucket while it stands and is gone once nothing holds it', () => {
        const { db, byDeckService, byDeck } = setUp();
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnSlotByKey(byDeck, 'spades');
        const spades = byDeckService.getSlotByKey(byDeck, 'spades');
        db.flush();
        expect(isOIMSlotReleased(spades)).toBe(false);

        byDeckService.columnSlotService.unholdColumnSlot(spadesAnyColumn);
        db.flush();

        expect(isOIMSlotReleased(spadesAnyColumn)).toBe(true);
    });

    it('lives only as long as a read that nobody kept', () => {
        const { db, byDeckService, byDeck } = setUp();
        const spadesAnyColumn = byDeckService.getAnyBucketColumnSlotByKey(byDeck, 'spades');

        db.flush();

        expect(isOIMSlotReleased(spadesAnyColumn)).toBe(true);
    });

    it('hangs on its own bucket', () => {
        const { byDeckService, byDeck } = setUp();
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnSlotByKey(byDeck, 'spades');

        expect(spadesAnyColumn.carrierSlot).toBe(byDeckService.getSlotByKey(byDeck, 'spades'));
        byDeckService.columnSlotService.unholdColumnSlot(spadesAnyColumn);
    });
});
