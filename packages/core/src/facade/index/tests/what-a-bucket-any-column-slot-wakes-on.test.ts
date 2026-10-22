import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

function setUp() {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntities(cards, [
        { id: 'c1', deck: 'spades', title: 'Ace' },
        { id: 'c2', deck: 'spades', title: 'King' },
        { id: 'c3', deck: 'hearts', title: 'Queen' },
    ]);
    const byDeckService = createOIMIndexService<
        TCard, TOIMStoreKey, readonly TOIMEntityColumnName<TCard>[], string,
        Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>, TOIMBucketSlotsSetStore<TCardSlot>,
        OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, {
        entityService: cardsService,
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
        keyOf: card => card.deck,
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const updateTitleOf = (key: string, patch: Partial<TCard>): void => {
        const slot = cardsService.findSlotByKey(cards, key);
        if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
    };
    return { db, effectService, cardsService, cards, byDeckService, byDeck, updateTitleOf };
}

describe('the any-column slot of an index bucket', () => {
    it('wakes on a write to a member that stays in its bucket, where the bucket does not', () => {
        const { db, effectService, byDeckService, byDeck, updateTitleOf } = setUp();
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnByKey(byDeck, 'spades');
        let bucketRuns = 0;
        let anyColumnRuns = 0;
        effectService.createEffect(db, [spades], [], () => { bucketRuns++; });
        effectService.createEffect(db, [spadesAnyColumn], [], () => { anyColumnRuns++; });

        updateTitleOf('c1', { title: 'Ace of Spades' });
        db.flush();

        expect(bucketRuns).toBe(0);
        expect(anyColumnRuns).toBe(1);
    });

    it('leaves a member joining or leaving to the bucket slot', () => {
        const { db, effectService, byDeckService, byDeck, updateTitleOf } = setUp();
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnByKey(byDeck, 'spades');
        let bucketRuns = 0;
        let anyColumnRuns = 0;
        effectService.createEffect(db, [spades], [], () => { bucketRuns++; });
        effectService.createEffect(db, [spadesAnyColumn], [], () => { anyColumnRuns++; });

        updateTitleOf('c3', { deck: 'spades' });
        db.flush();
        updateTitleOf('c1', { deck: 'hearts' });
        db.flush();

        expect(bucketRuns).toBe(2);
        expect(anyColumnRuns).toBe(0);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(card => card?.id).sort()).toEqual(['c2', 'c3']);
    });

    it('stays silent for a write to a member of another bucket', () => {
        const { db, effectService, byDeckService, byDeck, updateTitleOf } = setUp();
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnByKey(byDeck, 'spades');
        let anyColumnRuns = 0;
        effectService.createEffect(db, [spadesAnyColumn], [], () => { anyColumnRuns++; });

        updateTitleOf('c3', { title: 'Queen of Hearts' });
        db.flush();

        expect(anyColumnRuns).toBe(0);
    });

    it('wakes once for many in-place writes in one batch', () => {
        const { db, effectService, cardsService, cards, byDeckService, byDeck } = setUp();
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnByKey(byDeck, 'spades');
        let anyColumnRuns = 0;
        effectService.createEffect(db, [spadesAnyColumn], [], () => { anyColumnRuns++; });

        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deck: 'spades', title: 'Ace of Spades' },
            { id: 'c2', deck: 'spades', title: 'King of Spades' },
        ]);
        db.flush();

        expect(anyColumnRuns).toBe(1);
    });

    it('keeps its bucket while it stands and is gone once nothing holds it', () => {
        const { db, byDeckService, byDeck } = setUp();
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnByKey(byDeck, 'spades');
        const spades = byDeckService.getSlotByKey(byDeck, 'spades');
        db.flush();
        expect(oimIsSlotReleased(spades)).toBe(false);

        byDeckService.unholdColumn(spadesAnyColumn);
        db.flush();

        expect(oimIsSlotReleased(spadesAnyColumn)).toBe(true);
    });

    it('lives only as long as a read that nobody kept', () => {
        const { db, byDeckService, byDeck } = setUp();
        const spadesAnyColumn = byDeckService.getAnyBucketColumnByKey(byDeck, 'spades');

        db.flush();

        expect(oimIsSlotReleased(spadesAnyColumn)).toBe(true);
    });

    it('hangs on its own bucket', () => {
        const { byDeckService, byDeck } = setUp();
        const spadesAnyColumn = byDeckService.holdAnyBucketColumnByKey(byDeck, 'spades');

        expect(spadesAnyColumn.carrierSlot).toBe(byDeckService.getSlotByKey(byDeck, 'spades'));
        byDeckService.unholdColumn(spadesAnyColumn);
    });
});
