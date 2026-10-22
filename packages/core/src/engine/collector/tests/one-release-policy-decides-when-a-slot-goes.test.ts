import {
    OIMDB,
    OIMEffectService,
    OIMReleaseSlotCollectorServiceAfterIdle,
    OIMReleaseSlotCollectorServiceAfterUnhold,
    OIMReleaseSlotCollectorServiceAfterWrite,
    OIMReleaseSlotQueueService,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotReleasePolicyAfterIdle,
    OIMSlotReleasePolicyAfterUnhold,
    OIMSlotReleasePolicyAfterWrite,
    OIMSlotReleasePolicyAtEmpty,
    OIMSlotReleasePolicyAtUnhold,
    OIMSlotReleasePolicyEarliest,
    OIMSlotReleasePolicyNever,
    createOIMBucketService,
    createOIMEntityService,
    oimIsSlotReleased,
} from '../../../index';
import type { IOIMSlotReleasePolicy, TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMStoreKey } from '../../../index';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const START = 1_000_000;
const NO_TIMER = (): (() => void) => () => undefined;

const createFixture = (slotReleasePolicy: IOIMSlotReleasePolicy | undefined) => {
    let ms = START;
    const db = new OIMDB({ slotReleasePolicy });
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards, at: (value: number): void => { ms = value; }, nowMs: (): number => ms };
};

const createDecksService = (db: OIMDB, slotReleasePolicy: IOIMSlotReleasePolicy) => createOIMBucketService<
    TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(), slotReleasePolicy });

describe('one release policy decides when a slot goes', () => {
    it('with no policy, a row with a value stays for good', () => {
        const fixture = createFixture(undefined);
        const card = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();
        fixture.at(START + 10 ** 9);
        fixture.db.flush();
        expect(oimIsSlotReleased(card)).toBe(false);
    });

    it('with no policy, no write asks OIMSlotReleasePolicyAtEmpty anything, because it schedules no release on write', () => {
        const onSlotWritten = jest.spyOn(OIMSlotReleasePolicyAtEmpty.prototype, 'onSlotWritten');
        try {
            const fixture = createFixture(undefined);
            fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
            const card = fixture.cardsService.findSlotByKey(fixture.cards, 'c1');
            if (card !== undefined) fixture.cardsService.slotContentService.updateEntity(card, { title: 'two' });
            expect(onSlotWritten).toHaveBeenCalledTimes(0);
        } finally {
            onSlotWritten.mockRestore();
        }
    });

    it('at empty: a collection keeps a filled slot through holds under a database that releases at unhold, and lets a deleted one go', () => {
        const db = new OIMDB({ slotReleasePolicy: new OIMSlotReleasePolicyAtUnhold() });
        const cardsService = createOIMEntityService<TCard>(db, {
            keyOf: card => card.id, slotReleasePolicy: new OIMSlotReleasePolicyAtEmpty(),
        });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        const cardSlot = cardsService.holdSlotByKey(cards, 'c1');
        cardSlot.owner.unholdSlot(cardSlot);
        db.flush();
        expect(oimIsSlotReleased(card)).toBe(false);

        const deletedSlot = cardsService.findSlotByKey(cards, 'c1');
        if (deletedSlot !== undefined) cardsService.slotContentService.deleteEntity(deletedSlot);
        db.flush();
        expect(oimIsSlotReleased(card)).toBe(true);
    });

    it('never: a collection keeps a slot through holds and a delete under a database that releases at unhold', () => {
        const db = new OIMDB({ slotReleasePolicy: new OIMSlotReleasePolicyAtUnhold() });
        const cardsService = createOIMEntityService<TCard>(db, {
            keyOf: card => card.id, slotReleasePolicy: new OIMSlotReleasePolicyNever(),
        });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        const cardSlot = cardsService.holdSlotByKey(cards, 'c1');
        cardSlot.owner.unholdSlot(cardSlot);
        const deletedSlot = cardsService.findSlotByKey(cards, 'c1');
        if (deletedSlot !== undefined) cardsService.slotContentService.deleteEntity(deletedSlot);
        db.flush();

        expect(oimIsSlotReleased(card)).toBe(false);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(card);
        expect(cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'two' })).toBe(card);
    });

    it('after write: a row goes once its write is older than the window', () => {
        let ms = START;
        const slotReleasePolicy = new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 30_000 });
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER, slotReleasePolicy });
        const collectorSlot = db.collectorSlot.afterWriteReleaseSlotCollectorSlot;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();
        ms = START + 29_000;
        OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.flush(collectorSlot);
        expect(oimIsSlotReleased(card)).toBe(false);
        ms = START + 31_000;
        OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.flush(collectorSlot);
        expect(oimIsSlotReleased(card)).toBe(true);
    });

    it('after idle: a row goes once nothing has watched it for the window', () => {
        let ms = START;
        const slotReleasePolicy = new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: 5_000 });
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER, slotReleasePolicy });
        const collectorSlot = db.collectorSlot.afterIdleReleaseSlotCollectorSlot;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        const effect = OIMEffectService.INSTANCE.createEffect(db, [card], [], () => undefined);
        db.flush();
        ms = START + 60_000;
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(collectorSlot);
        expect(oimIsSlotReleased(card)).toBe(false);
        OIMEffectService.INSTANCE.disposeEffect(effect);
        ms = START + 64_000;
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(collectorSlot);
        expect(oimIsSlotReleased(card)).toBe(false);
        ms = START + 66_000;
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(collectorSlot);
        expect(oimIsSlotReleased(card)).toBe(true);
    });

    it('at unhold: a bucket with slots goes at its last unhold', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const decksService = createDecksService(db, new OIMSlotReleasePolicyAtUnhold());
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd1');
        decksService.slotContentService.writeBucketMemberSlots(
            deck, [cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' })],
        );
        db.flush();
        deck.owner.unholdSlot(deck);
        expect(oimIsSlotReleased(deck)).toBe(true);
    });

    it('after unhold: a bucket with slots stays for the window after its last unhold, and a hold in between keeps it', () => {
        let ms = START;
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER });
        const collectorSlot = db.collectorSlot.afterUnholdReleaseSlotCollectorSlot;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const decksService = createDecksService(db, new OIMSlotReleasePolicyAfterUnhold({ keepAfterUnholdMs: 10_000 }));
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd1');
        decksService.slotContentService.writeBucketMemberSlots(
            deck, [cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' })],
        );
        db.flush();
        deck.owner.unholdSlot(deck);
        expect(oimIsSlotReleased(deck)).toBe(false);
        ms = START + 9_000;
        OIMReleaseSlotCollectorServiceAfterUnhold.INSTANCE.flush(collectorSlot);
        expect(oimIsSlotReleased(deck)).toBe(false);
        deck.owner.holdSlot(deck);
        ms = START + 11_000;
        OIMReleaseSlotCollectorServiceAfterUnhold.INSTANCE.flush(collectorSlot);
        expect(oimIsSlotReleased(deck)).toBe(false);
        deck.owner.unholdSlot(deck);
        ms = START + 22_000;
        OIMReleaseSlotCollectorServiceAfterUnhold.INSTANCE.flush(collectorSlot);
        expect(oimIsSlotReleased(deck)).toBe(true);
    });

    it('a zero window never touches the release queue: the slot goes at the end of the frame', () => {
        const db = new OIMDB({
            getNowMs: () => START,
            releaseTimer: NO_TIMER,
            slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: 0 }),
        });
        const collectorSlot = db.collectorSlot.afterIdleReleaseSlotCollectorSlot;
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        expect(OIMReleaseSlotQueueService.INSTANCE.getNextReleaseSliceNumber(collectorSlot)).toBeUndefined();
        db.flush();
        expect(oimIsSlotReleased(card)).toBe(true);
        expect(OIMReleaseSlotQueueService.INSTANCE.getNextReleaseSliceNumber(collectorSlot)).toBeUndefined();
    });

    it('earliest: two policies at once, the earlier deadline wins', () => {
        let ms = START;
        const slotReleasePolicy = new OIMSlotReleasePolicyEarliest([
            new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 60_000 }),
            new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: 5_000 }),
        ]);
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER, slotReleasePolicy });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();
        ms = START + 6_000;
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(db.collectorSlot.afterIdleReleaseSlotCollectorSlot);
        expect(oimIsSlotReleased(card)).toBe(true);
    });
});
