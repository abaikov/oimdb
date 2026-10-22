import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { createOIMIndexServiceByCompositeKey } from '../../../factories/createOIMIndexServiceByCompositeKey';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMSlotStoreServiceTreeDriven } from '../../../engine/store/OIMSlotStoreServiceTreeDriven';
import { OIM_DEFAULT_KEY_TREE_WALK_SCALAR } from '../../../factories/defaults/OIM_DEFAULT_KEY_TREE_WALK_SCALAR';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';

type TCard = { id: string; deck: string; suit: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TDeckAndSuit = readonly [string, string];
type TDeckAndSuitBucket = TOIMBucketSlot<TOIMBucketSlotsArrayStore<TCardSlot>, TDeckAndSuit>;

const createCards = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntities(cards, [
        { id: 'c1', deck: 'red', suit: 'hearts', title: 'ace' },
        { id: 'c2', deck: 'red', suit: 'hearts', title: 'two' },
        { id: 'c3', deck: 'red', suit: 'spades', title: 'three' },
        { id: 'c4', deck: 'blue', suit: 'hearts', title: 'four' },
    ]);
    db.flush();
    const byDeckAndSuitService = createOIMIndexServiceByCompositeKey(db, {
        entityService: cardsService,
        columns: ['deck', 'suit'],
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
    });
    const byDeckAndSuit = byDeckAndSuitService.createIndexStoreSlot(cards);
    return { db, cardsService, cards, byDeckAndSuitService, byDeckAndSuit };
};

const titlesIn = (
    byDeckAndSuitService: ReturnType<typeof createCards>['byDeckAndSuitService'],
    byDeckAndSuit: ReturnType<typeof createCards>['byDeckAndSuit'],
    key: TDeckAndSuit,
): string[] => byDeckAndSuitService.getEntitiesByKey(byDeckAndSuit, key).map(card => card?.title ?? '').sort();

describe('what an index keyed by several columns files', () => {
    it('fills a bucket minted by a read with every entity whose columns match, compared part by part', () => {
        const { byDeckAndSuitService, byDeckAndSuit } = createCards();
        expect(titlesIn(byDeckAndSuitService, byDeckAndSuit, ['red', 'hearts'])).toEqual(['ace', 'two']);
        expect(titlesIn(byDeckAndSuitService, byDeckAndSuit, ['red', 'spades'])).toEqual(['three']);
        expect(titlesIn(byDeckAndSuitService, byDeckAndSuit, ['blue', 'spades'])).toEqual([]);
    });

    it('fills every bucket a read of several array keys mints', () => {
        const { byDeckAndSuitService, byDeckAndSuit } = createCards();
        const [redHearts, redSpades, blueSpades] = byDeckAndSuitService.getSlotsByKeys(byDeckAndSuit, [
            ['red', 'hearts'], ['red', 'spades'], ['blue', 'spades'],
        ]);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redHearts)).toBe(2);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redSpades)).toBe(1);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(blueSpades)).toBe(0);
    });

    it('answers a fresh array with the same parts with the same bucket', () => {
        const { byDeckAndSuitService, byDeckAndSuit } = createCards();
        const redHearts = byDeckAndSuitService.holdSlotByKey(byDeckAndSuit, ['red', 'hearts']);
        expect(byDeckAndSuitService.getSlotByKey(byDeckAndSuit, ['red', 'hearts'])).toBe(redHearts);
    });

    it('moves an entity when one of its key columns changes', () => {
        const { db, cardsService, cards, byDeckAndSuitService, byDeckAndSuit } = createCards();
        const redHearts = byDeckAndSuitService.holdSlotByKey(byDeckAndSuit, ['red', 'hearts']);
        const redSpades = byDeckAndSuitService.holdSlotByKey(byDeckAndSuit, ['red', 'spades']);
        const c1 = cardsService.findSlotByKey(cards, 'c1');
        if (c1 !== undefined) cardsService.slotContentService.updateEntity(c1, { suit: 'spades' });
        db.flush();
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redHearts)).toBe(1);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redSpades)).toBe(2);
    });

    it('keeps an entity in place when a change with no column list builds a new key array with the same parts', () => {
        const { db, cardsService, cards, byDeckAndSuitService, byDeckAndSuit } = createCards();
        const redHearts = byDeckAndSuitService.holdSlotByKey(byDeckAndSuit, ['red', 'hearts']);
        db.flush();
        const c1 = cardsService.getSlotByKey(cards, 'c1');
        let wakes = 0;
        OIMEffectService.INSTANCE.createEffect(db, [redHearts], [], () => { wakes++; });
        cardsService.slotContentService.markEntityChanged(c1);
        db.flush();
        expect(byDeckAndSuitService.slotContentService.hasBucketMemberSlot(redHearts, c1)).toBe(true);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redHearts)).toBe(2);
        expect(wakes).toBe(0);
    });

    it('wakes the any-column slot of a bucket when a member is written, found by a fresh array', () => {
        const { db, cardsService, cards, byDeckAndSuitService, byDeckAndSuit } = createCards();
        const redHeartsEntities = byDeckAndSuitService.holdAnyBucketColumnByKey(byDeckAndSuit, ['red', 'hearts']);
        expect(byDeckAndSuitService.getAnyBucketColumnByKey(byDeckAndSuit, ['red', 'hearts'])).toBe(redHeartsEntities);
        db.flush();
        let wakes = 0;
        OIMEffectService.INSTANCE.createEffect(db, [redHeartsEntities], [], () => { wakes++; });
        const c1 = cardsService.findSlotByKey(cards, 'c1');
        if (c1 !== undefined) cardsService.slotContentService.updateEntity(c1, { title: 'ace of hearts' });
        db.flush();
        expect(wakes).toBe(1);
    });

    it('moves a batch of entities between buckets', () => {
        const { db, cardsService, cards, byDeckAndSuitService, byDeckAndSuit } = createCards();
        const redHearts = byDeckAndSuitService.holdSlotByKey(byDeckAndSuit, ['red', 'hearts']);
        const blueHearts = byDeckAndSuitService.holdSlotByKey(byDeckAndSuit, ['blue', 'hearts']);
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deck: 'blue', suit: 'hearts', title: 'ace' },
            { id: 'c2', deck: 'blue', suit: 'hearts', title: 'two' },
        ]);
        db.flush();
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redHearts)).toBe(0);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(blueHearts)).toBe(3);
    });

    it('works the same in an array-driven index', () => {
        const { cardsService, cards, db } = createCards();
        const byDeckAndSuitService = createOIMIndexServiceByCompositeKey(db, {
            entityService: cardsService,
            columns: ['deck', 'suit'],
        });
        const byDeckAndSuit = byDeckAndSuitService.createIndexStoreSlot(cards);
        expect(byDeckAndSuitService.getEntitiesByKey(byDeckAndSuit, ['red', 'hearts']).map(card => card?.title).sort()).toEqual(['ace', 'two']);
    });

    it('reads its key type from the columns, and takes an array key only through the composite-key door', () => {
        const { cardsService, cards, db } = createCards();
        const byDeckService = createOIMIndexService(db, { entityService: cardsService, columns: ['deck'] });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.getSlotByKey(byDeck, 'red');
        // @ts-expect-error a one-column index is keyed by the column's value, not an array
        byDeckService.getSlotByKey(byDeck, ['red']);
        const byDeckAndSuitService = createOIMIndexServiceByCompositeKey(db, { entityService: cardsService, columns: ['deck', 'suit'] });
        const byDeckAndSuit = byDeckAndSuitService.createIndexStoreSlot(cards);
        // @ts-expect-error a two-column key has two parts
        byDeckAndSuitService.getSlotByKey(byDeckAndSuit, ['red']);
        // @ts-expect-error a key of several columns is an array key, which the scalar-key door does not take
        createOIMIndexService(db, { entityService: cardsService, columns: ['deck', 'suit'] });
        // @ts-expect-error a key function must return a store key
        createOIMIndexService(db, { entityService: cardsService, keyOf: card => ({ deck: card.deck }) });
        // @ts-expect-error a key type handed by hand must be the one its columns give
        createOIMIndexService<TCard, TOIMStoreKey, readonly ['deck'], number>(db, { entityService: cardsService, columns: ['deck'] });
        createOIMIndexService<TCard, TOIMStoreKey, readonly ['deck'], string>(db, { entityService: cardsService, columns: ['deck'] });
        const deckAndSuit: ('deck' | 'suit')[] = ['deck', 'suit'];
        // @ts-expect-error columns whose count the type does not know give no key, so the scalar-key door refuses them
        createOIMIndexService(db, { entityService: cardsService, columns: deckAndSuit });
        // @ts-expect-error and so does the composite-key door
        createOIMIndexServiceByCompositeKey(db, { entityService: cardsService, columns: deckAndSuit });
        // @ts-expect-error an array key function takes the composite-key door
        createOIMIndexService(db, { entityService: cardsService, keyOf: card => [card.deck, card.suit] });
        const byDeckAndSuitFunctionService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard): TDeckAndSuit => [card.deck, card.suit],
            bucketSlotStoreService: new OIMSlotStoreServiceTreeDriven<TOIMStoreKey, TDeckAndSuitBucket>(
                OIM_DEFAULT_KEY_TREE_WALK_SCALAR.getValue(),
            ),
        });
        const byDeckAndSuitFunction = byDeckAndSuitFunctionService.createIndexStoreSlot(cards);
        expect(byDeckAndSuitFunctionService.getEntitiesByKey(byDeckAndSuitFunction, ['red', 'hearts']).map(card => card?.title).sort()).toEqual(['ace', 'two']);
    });
});
