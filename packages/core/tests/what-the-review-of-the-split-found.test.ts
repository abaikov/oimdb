import {
    OIMChannelService,
    OIMContentChangeListenerService,
    OIMDB,
    OIMEffectService,
    OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService,
    createOIMEntityService,
    createOIMIndexService,
    createOIMIndexServiceByCompositeKey,
    oimIsSlotReleased,
} from '../src/index';
import type { TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMSlot } from '../src/index';
import type { OIMChannelQueue } from '../src/engine/channel/OIMChannelQueue';

type TCard = { id: string; deck: string; title: string };

type TCardSlot = TOIMEntitySlot<TCard>;

type TSuitedCard = { id: string; deck: string; suit: string; title: string };

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

const createListenerThrowingOnce = () => {
    const state = { isArmed: false, throwCount: 0, heard: [] as TOIMSlot[] };
    const hear = (slot: TOIMSlot): void => {
        state.heard.push(slot);
        if (!state.isArmed) return;
        state.isArmed = false;
        state.throwCount++;
        throw new Error('listener refused');
    };
    const listener = {
        onContentChanged: (slot: TOIMSlot): void => { hear(slot); },
        onContentChangedMany: (slotChannelQueue: OIMChannelQueue<TOIMSlot>): void => {
            for (let i = 0; i < slotChannelQueue.getEntryCount(); i++) hear(slotChannelQueue.getEntryAt(i));
        },
    };
    return { state, listener };
};

const createBucketFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const decksService = createOIMBucketService<
        TCardSlot, string, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
    const decks = decksService.createStoreSlot(db);
    const { state, listener } = createListenerThrowingOnce();
    OIMContentChangeListenerService.INSTANCE.addContentChangeListener(decks, listener, undefined);
    const a = cardsService.slotContentService.upsertEntity(cards, { id: 'a', deck: 'none', title: 'ace' });
    const b = cardsService.slotContentService.upsertEntity(cards, { id: 'b', deck: 'none', title: 'two' });
    db.flush();
    return { db, decks, decksService, state, a, b };
};

describe('what a dispose called inside a flush leaves behind', () => {
    const createFixture = () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', deck: 'x', title: 'ace' });
        const byDeckService = createOIMIndexService(db, {
            entityService: cardsService,
            columns: ['deck'],
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const byDeckTooService = createOIMIndexService(db, {
            entityService: cardsService,
            columns: ['deck'],
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
        });
        const byDeckToo = byDeckTooService.createIndexStoreSlot(cards);
        const run = { isArmed: false, runCount: 0, refusal: undefined as unknown };
        effectService.createEffect(db, [cardsService.getSlotByKey(cards, 'a')], [], () => {
            if (!run.isArmed) return;
            run.isArmed = false;
            run.runCount++;
            run.refusal = refusalOf(() => { byDeckService.disposeIndexStoreSlot(byDeck); });
        });
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

describe('what a listener refusing a bucket\'s first change in a batch leaves behind', () => {
    it('announces a later change of the same held bucket in a new subframe', () => {
        const { db, decks, decksService, state, a, b } = createBucketFixture();
        const deck = decksService.holdSlotByKey(decks, 'd');
        db.flush();
        state.isArmed = true;

        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        refusalOf(() => { decksService.slotContentService.addBucketMemberSlots(deck, [a]); });
        refusalOf(() => { OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot); });
        db.flush();
        expect(state.throwCount).toBe(1);
        state.heard.length = 0;

        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        decksService.slotContentService.addBucketMemberSlots(deck, [b]);
        OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot);

        expect(state.heard.filter(slot => slot === deck).length).toBeGreaterThanOrEqual(1);
        expect(deck.wasEmptyBeforeChange).toBeUndefined();
        expect(deck.isChangedAgainInSubframe).toBe(false);
    });

    it('releases an unheld bucket the refused first change left empty, once the outer subframe closes', () => {
        const { db, decks, decksService, state, a } = createBucketFixture();
        const deck = decksService.getSlotByKey(decks, 'd');
        decksService.slotContentService.writeBucketMemberSlots(deck, [a]);
        db.flush();
        expect(oimIsSlotReleased(deck)).toBe(false);
        state.isArmed = true;

        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        refusalOf(() => { decksService.slotContentService.removeBucketMemberSlots(deck, [a]); });
        refusalOf(() => { OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot); });
        db.flush();

        expect(state.throwCount).toBe(1);
        expect(oimIsSlotReleased(deck)).toBe(true);
        expect(decksService.findSlotByKey(decks, 'd')).toBeUndefined();
    });
});

describe('what a re-announce refused at subframe close leaves behind', () => {
    it('still runs the release check of the changed-again bucket, so an unheld bucket the batch emptied is released', () => {
        const { db, decks, decksService, state, a, b } = createBucketFixture();
        const deck = decksService.getSlotByKey(decks, 'd');
        decksService.slotContentService.writeBucketMemberSlots(deck, [a]);
        db.flush();

        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        decksService.slotContentService.removeBucketMemberSlots(deck, [a]);
        decksService.slotContentService.addBucketMemberSlots(deck, [b]);
        decksService.slotContentService.removeBucketMemberSlots(deck, [b]);
        expect(deck.isChangedAgainInSubframe).toBe(true);
        state.isArmed = true;
        const refusal = refusalOf(() => { OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot); });
        db.flush();

        expect(refusal).toBeInstanceOf(Error);
        expect(state.throwCount).toBe(1);
        expect(oimIsSlotReleased(deck)).toBe(true);
        expect(decksService.findSlotByKey(decks, 'd')).toBeUndefined();
    });
});

describe('what an index keyed by two columns files into buckets minted several at a time', () => {
    const createCards = () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TSuitedCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deck: 'red', suit: 'hearts', title: 'ace' },
            { id: 'c2', deck: 'red', suit: 'hearts', title: 'two' },
            { id: 'c3', deck: 'red', suit: 'spades', title: 'three' },
            { id: 'c4', deck: 'blue', suit: 'hearts', title: 'four' },
        ]);
        db.flush();
        return { db, cards, cardsService };
    };

    const createSetDrivenIndexService = (fixture: ReturnType<typeof createCards>) =>
        createOIMIndexServiceByCompositeKey(fixture.db, {
            entityService: fixture.cardsService,
            columns: ['deck', 'suit'],
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TSuitedCard>>(),
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
        const { db, cards, cardsService } = createCards();
        const byDeckAndSuitService = createOIMIndexServiceByCompositeKey(db, { entityService: cardsService, columns: ['deck', 'suit'] });
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
