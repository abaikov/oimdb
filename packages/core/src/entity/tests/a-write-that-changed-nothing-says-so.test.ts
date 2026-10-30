import { OIMDB } from '../../db/OIMDB';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMSlotContentEntityService } from '../createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type Card = { id: string; deck: string; rank: number; note?: string };
type TCardSlot = TOIMEntitySlot<Card, TOIMStoreKey>;

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<Card>(db) });
    const cards = cardsService.createStoreSlot(db);
    /** Allocated once and reused — the whole of the shape. */
    const changed: TCardSlot[] = [];
    return { db, cardsService, cards, changed };
};

describe('a write that changed nothing says so', () => {
    it('names the row when the write put something in', () => {
        const { cardsService, cards, changed } = createFixture();

        const first = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1 }, changed);

        expect(changed).toHaveLength(1);
        expect(changed[0]).toBe(first);
    });

    it('names nothing for a row re-sent with the values it already holds', () => {
        const { cardsService, cards, changed } = createFixture();
        const first = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1 }, changed);
        changed.length = 0;

        // A FRESHLY ALLOCATED ROW OF THE SAME VALUES, which is what a re-send is:
        // the caller cannot pre-filter it and neither can a reference check.
        const again = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1 }, changed);

        expect(changed).toHaveLength(0);
        // AND THE IDENTITY STILL CAME BACK. Saying "nothing changed" must not
        // cost the caller its reference to a row that is standing perfectly well.
        expect(again).toBe(first);
        expect(cardsService.getSlotByKey(cards,'a')).toBe(first);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    it('names the row when one column changed', () => {
        const { cardsService, cards, changed } = createFixture();
        const first = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1 });
        expect(changed).toHaveLength(0);

        expect(cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 2 }, changed)).toBe(first);
        expect(changed).toHaveLength(1);
        expect(changed[0]).toBe(first);
    });

    it('names the row when a column left', () => {
        const { cardsService, cards, changed } = createFixture();
        const first = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1, note: 'x' });

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1 }, changed);
        expect(changed).toHaveLength(1);
        expect(changed[0]).toBe(first);
        expect(first.entity).toEqual({ id: 'a', deck: 'red', rank: 1 });

        // And re-sending THAT is a write that changed nothing again.
        changed.length = 0;
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1 }, changed);
        expect(changed).toHaveLength(0);
    });

    /**
     * ONE ARRAY FOR A WHOLE BATCH, which is the shape the parameter was chosen
     * for: the pass over a bucket's slots afterwards costs the rows that CHANGED
     * rather than the rows that arrived.
     */
    it('collects a batch into one array, holding only what was not already there', () => {
        const { cardsService, cards, changed } = createFixture();
        cardsService.writeInBatch(cards, () => ([
            { id: 'a', deck: 'red', rank: 1 },
            { id: 'b', deck: 'red', rank: 2 },
            { id: 'c', deck: 'blue', rank: 3 },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        expect(changed).toHaveLength(0);

        cardsService.writeInBatch(cards, () => ([
            { id: 'a', deck: 'red', rank: 1 },
            { id: 'b', deck: 'red', rank: 9 },
            { id: 'c', deck: 'blue', rank: 3 },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity, changed)));

        expect(changed).toHaveLength(1);
        expect(changed[0]).toBe(cardsService.getSlotByKey(cards,'b'));
    });

    /**
     * AND NOTHING WAS DELIVERED FOR IT EITHER — the verdict and the wake agree.
     * A verdict that disagreed with what the channel did would be worse than
     * none, so the two are asserted side by side.
     */
    it('wakes nobody for the write it names as no change', () => {
        const { db, cardsService, cards, changed } = createFixture();
        const first = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1 });
        db.flush();

        let runs = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => { runs++; }, [first]);
        db.flush();
        const before = runs;

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1 }, changed);
        db.flush();

        expect(changed).toHaveLength(0);
        expect(runs).toBe(before);
        OIMEffectService.INSTANCE.disposeEffect(effect);
    });

    /**
     * THE RULE, FROM THE SIDE THAT BROKE. A bucket key nobody has written, given
     * an EMPTY list of slots, is a miss whose service answers "nothing changed" —
     * and the door still minted it, so it still owes its caller the reference.
     * Encoding the verdict in the return unfiled it in the same call.
     */
    it('hands back a bucket it minted even when the slots it wrote changed nothing', () => {
        const db = new OIMDB();
        const decksService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TCardSlot>() });
        const decks = decksService.createStoreSlot(db);

        const bucket = decksService.getSlotByKey(decks, 'd1');
        const isChanged = decksService.slotContentService.writeSlotContent(bucket, []);

        expect(isChanged).toBe(false);
        expect(decksService.getSlotByKey(decks, 'd1')).toBe(bucket);
        expect(decksService.getSlotCount(decks)).toBe(1);

        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(decksService.getSlotCount(decks)).toBe(0);
    });
});
