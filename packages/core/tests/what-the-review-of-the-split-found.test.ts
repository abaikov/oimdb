import { OIMDB, OIMEffectService, OIMSetBucketContentService, createOIMSlotCollectionIndexService } from '../src/index';
import type { TOIMEntitySlot } from '../src/index';
import { createOIMEntityContentService } from '../src/index';
import { createOIMSlotCollectionService } from '../src/index';
import { OIMSlotTreeStoreService } from '../src/store/OIMSlotTreeStoreService';
import { OIMScalarKeyTreeWalk } from '../src/key/OIMScalarKeyTreeWalk';

import type { TOIMStoreKey } from '../src/store/types/TOIMStoreKey';
import type { TOIMBucketSlot } from '../src/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../src/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketSlotsSetStore } from '../src/bucket/types/TOIMBucketSlotsSetStore';
import type { IOIMSlotStoreService } from '../src/store/interfaces/IOIMSlotStoreService';
import type { TOIMSlotStoreTree } from '../src/store/types/TOIMSlotStoreTree';

type TCard = { id: string; deck: string; title: string };

type TCardSlot = TOIMEntitySlot<TCard>;

type TSuitedCard = { id: string; deck: string; suit: string; title: string };

const byDeckAndSuitBucketStoreService = <TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TSuitedCard>>>() => new OIMSlotTreeStoreService<
    TOIMStoreKey, TOIMBucketSlot<TSlots, readonly [string, string]>
>(OIMScalarKeyTreeWalk.INSTANCE) as unknown as IOIMSlotStoreService<
    readonly [string, string], TOIMBucketSlot<TSlots, readonly [string, string]>,
    TOIMSlotStoreTree<TOIMBucketSlot<TSlots, readonly [string, string]>, TOIMStoreKey>
>;


type TColumnReadCounts = { columnListenerCountsByColumnName: Map<string, number> | undefined };

const columnReadCountOf = (storeSlot: TColumnReadCounts, columnName: string): number =>
    storeSlot.columnListenerCountsByColumnName?.get(columnName) ?? 0;

const isIndexDisposed = (indexStoreSlot: { readonly isDisposed: boolean }): boolean => indexStoreSlot.isDisposed;

const refusalOf = (door: () => void): unknown => {
    try {
        door();
    } catch (refusal) {
        return refusal;
    }
    return undefined;
};

describe('what a dispose called inside a flush leaves behind', () => {
    const createFixture = () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'x', title: 'ace' });
        const byDeckService = createOIMSlotCollectionIndexService({
            entityService: cardsService,
            columns: ['deck'],
            slotContentService: new OIMSetBucketContentService<TCardSlot, string>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const byDeckTooService = createOIMSlotCollectionIndexService({
            entityService: cardsService,
            columns: ['deck'],
            slotContentService: new OIMSetBucketContentService<TCardSlot, string>(),
        });
        const byDeckToo = byDeckTooService.createIndexStoreSlot(cards);
        const run = { isArmed: false, runCount: 0, refusal: undefined as unknown };
        effectService.createEffect(db, () => {
            if (!run.isArmed) return;
            run.isArmed = false;
            run.runCount++;
            run.refusal = refusalOf(() => { byDeckService.disposeIndexStoreSlot(byDeck); });
        }, [cardsService.getSlotByKey(cards, 'a')]);
        db.flush();
        const updateCard = (key: string, patch: Partial<TCard>): void => {
            const cardSlot = cardsService.findSlotByKey(cards, key);
            if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, patch);
        };
        return { db, cards, cardsService, byDeck, byDeckService, byDeckToo, byDeckTooService, run, updateCard };
    };

    const disposeInsideAFlush = (fixture: ReturnType<typeof createFixture>): void => {
        fixture.run.isArmed = true;
        fixture.updateCard('a', { title: 'ace of x' });
        fixture.db.flush();
    };

    it('refuses the dispose inside the flush and leaves the index undisposed', () => {
        const fixture = createFixture();

        disposeInsideAFlush(fixture);

        expect(fixture.run.runCount).toBe(1);
        expect(fixture.run.refusal).toBeInstanceOf(Error);
        expect(isIndexDisposed(fixture.byDeck)).toBe(false);
    });

    it('leaves the index still hearing a key column write after the refused dispose', () => {
        const fixture = createFixture();
        const x = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'x');
        const y = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'y');
        fixture.db.flush();

        disposeInsideAFlush(fixture);
        fixture.updateCard('a', { deck: 'y' });

        expect(fixture.byDeckService.slotContentService.getBucketMemberSlotCount(x)).toBe(0);
        expect(fixture.byDeckService.slotContentService.getBucketMemberSlotCount(y)).toBe(1);
    });

    it('leaves the key column read held by both indexes after the refused dispose', () => {
        const fixture = createFixture();
        expect(columnReadCountOf(fixture.cards,'deck')).toBe(2);

        disposeInsideAFlush(fixture);

        expect(columnReadCountOf(fixture.cards,'deck')).toBe(2);
    });

    it('disposes outside the flush after the refused one, taking back exactly its own column read', () => {
        const fixture = createFixture();
        disposeInsideAFlush(fixture);

        expect(() => { fixture.byDeckService.disposeIndexStoreSlot(fixture.byDeck); }).not.toThrow();

        expect(isIndexDisposed(fixture.byDeck)).toBe(true);
        expect(columnReadCountOf(fixture.cards,'deck')).toBe(1);
    });

    it('leaves a second index on the same column hearing its writes after the refused and retried dispose', () => {
        const fixture = createFixture();
        const x = fixture.byDeckTooService.holdSlotByKey(fixture.byDeckToo, 'x');
        const y = fixture.byDeckTooService.holdSlotByKey(fixture.byDeckToo, 'y');
        fixture.db.flush();
        disposeInsideAFlush(fixture);
        fixture.byDeckService.disposeIndexStoreSlot(fixture.byDeck);

        fixture.updateCard('a', { deck: 'y' });

        expect(fixture.byDeckTooService.slotContentService.getBucketMemberSlotCount(x)).toBe(0);
        expect(fixture.byDeckTooService.slotContentService.getBucketMemberSlotCount(y)).toBe(1);
    });
});

describe('what an index keyed by two columns files into buckets minted several at a time', () => {
    const createCards = () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TSuitedCard>() });
        const cards = cardsService.createStoreSlot(db);
        cardsService.writeInBatch(cards, () => ([
            { id: 'c1', deck: 'red', suit: 'hearts', title: 'ace' },
            { id: 'c2', deck: 'red', suit: 'hearts', title: 'two' },
            { id: 'c3', deck: 'red', suit: 'spades', title: 'three' },
            { id: 'c4', deck: 'blue', suit: 'hearts', title: 'four' },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();
        return { db, cards, cardsService };
    };

    const createSetDrivenIndexService = (fixture: ReturnType<typeof createCards>) =>
        createOIMSlotCollectionIndexService({ bucketSlotStoreService: byDeckAndSuitBucketStoreService<TOIMBucketSlotsSetStore<TOIMEntitySlot<TSuitedCard>>>(),
            entityService: fixture.cardsService,
            keyOf: (card: TSuitedCard): readonly [string, string] => [card.deck, card.suit], columns: ['deck', 'suit'],
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TSuitedCard>, readonly [string, string]>(),
        });

    it('fills the buckets getSlotsByKeys mints with the entities written before, as getSlotByKey does', () => {
        const fixture = createCards();
        const byDeckAndSuitService = createSetDrivenIndexService(fixture);
        const byDeckAndSuit = byDeckAndSuitService.createIndexStoreSlot(fixture.cards);
        const oneByOneService = createSetDrivenIndexService(fixture);
        const oneByOne = oneByOneService.createIndexStoreSlot(fixture.cards);

        const [redHearts, redSpades, blueHearts] = byDeckAndSuitService.getSlotsByKeys(byDeckAndSuit, [
            ['red', 'hearts'], ['red', 'spades'], ['blue', 'hearts'],
        ]);

        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redHearts))
            .toBe(oneByOneService.slotContentService.getBucketMemberSlotCount(oneByOneService.getSlotByKey(oneByOne, ['red', 'hearts'])));
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redHearts)).toBe(2);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redSpades)).toBe(1);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(blueHearts)).toBe(1);
    });

    it('fills the buckets holdSlotsByKeys mints with the entities written before', () => {
        const fixture = createCards();
        const byDeckAndSuitService = createSetDrivenIndexService(fixture);
        const byDeckAndSuit = byDeckAndSuitService.createIndexStoreSlot(fixture.cards);

        const [redHearts, redSpades] = byDeckAndSuitService.holdSlotsByKeys(byDeckAndSuit, [['red', 'hearts'], ['red', 'spades']]);

        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redHearts)).toBe(2);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redSpades)).toBe(1);
        expect(byDeckAndSuitService.getEntitiesByKey(byDeckAndSuit, ['red', 'hearts']).map(card => card?.title).sort()).toEqual(['ace', 'two']);
    });

    it('fills the buckets an array-driven composite index mints several at a time', () => {
        const { cards, cardsService } = createCards();
        const byDeckAndSuitService = createOIMSlotCollectionIndexService({ bucketSlotStoreService: byDeckAndSuitBucketStoreService(), entityService: cardsService, keyOf: (card: TSuitedCard): readonly [string, string] => [card.deck, card.suit], columns: ['deck', 'suit'] });
        const byDeckAndSuit = byDeckAndSuitService.createIndexStoreSlot(cards);

        const [redHearts, blueHearts] = byDeckAndSuitService.holdSlotsByKeys(byDeckAndSuit, [['red', 'hearts'], ['blue', 'hearts']]);

        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redHearts)).toBe(2);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(blueHearts)).toBe(1);
    });

    it('moves an entity written before the mint when its key column changes after it', () => {
        const fixture = createCards();
        const byDeckAndSuitService = createSetDrivenIndexService(fixture);
        const byDeckAndSuit = byDeckAndSuitService.createIndexStoreSlot(fixture.cards);
        const [redHearts, blueHearts] = byDeckAndSuitService.holdSlotsByKeys(byDeckAndSuit, [['red', 'hearts'], ['blue', 'hearts']]);

        const c1Slot = fixture.cardsService.findSlotByKey(fixture.cards, 'c1');
        if (c1Slot !== undefined) fixture.cardsService.slotContentService.updateEntity(c1Slot, { deck: 'blue' });

        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redHearts)).toBe(1);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(blueHearts)).toBe(2);
    });
});
