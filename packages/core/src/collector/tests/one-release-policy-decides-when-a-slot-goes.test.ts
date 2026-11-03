import { OIMDefaults } from '../../index';
import { OIMDB, OIMEffectService, mintOIMAfterIdleSlotReleaseWheel, mintOIMAfterUnholdSlotReleaseWheel, mintOIMAfterWriteSlotReleaseWheel, OIMSetBucketContentService, OIMSlotAfterIdleReleasePolicy, OIMSlotAfterUnholdReleasePolicy, OIMSlotAfterWriteReleasePolicy, OIMSlotAtEmptyReleasePolicy, OIMSlotAtUnholdReleasePolicy, OIMSlotEarliestReleasePolicy, OIMSlotNeverReleasePolicy, isOIMSlotReleased } from '../../index';
import type { IOIMSlotReleasePolicy, TOIMEntitySlot } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const START = 1_000_000;
const NO_TIMER = (): (() => void) => () => undefined;

const createFixture = (slotReleasePolicy: IOIMSlotReleasePolicy | undefined) => {
    let ms = START;
    const defaults = new OIMDefaults({ slotReleasePolicy });
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard>({ defaults }) });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards, at: (value: number): void => { ms = value; }, nowMs: (): number => ms };
};

const createDecksService = (slotReleasePolicy: IOIMSlotReleasePolicy) => createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService<TCardSlot>(), slotReleasePolicy });

describe('one release policy decides when a slot goes', () => {
    it('with no policy, a row with a value stays for good', () => {
        const fixture = createFixture(undefined);
        const card = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();
        fixture.at(START + 10 ** 9);
        fixture.db.flush();
        expect(isOIMSlotReleased(card)).toBe(false);
    });

    it('with no policy, no write asks OIMSlotAtEmptyReleasePolicy anything, because it schedules no release on write', () => {
        const onSlotWritten = jest.spyOn(OIMSlotAtEmptyReleasePolicy.prototype, 'onSlotWritten');
        try {
            const fixture = createFixture(undefined);
            fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
            const card = fixture.cardsService.peekSlotByKey(fixture.cards, 'c1');
            if (card !== undefined) fixture.cardsService.slotContentService.updateEntity(card, { title: 'two' });
            expect(onSlotWritten).toHaveBeenCalledTimes(0);
        } finally {
            onSlotWritten.mockRestore();
        }
    });

    it('at empty: a collection keeps a filled slot through holds under a database that releases at unhold, and lets a deleted one go', () => {
        const defaults = new OIMDefaults({ slotReleasePolicy: new OIMSlotAtUnholdReleasePolicy() });
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard>({ defaults }), slotReleasePolicy: new OIMSlotAtEmptyReleasePolicy() });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        const cardSlot = cardsService.holdSlotByKey(cards, 'c1');
        cardSlot.owner.unholdSlot(cardSlot);
        db.flush();
        expect(isOIMSlotReleased(card)).toBe(false);

        const deletedSlot = cardsService.peekSlotByKey(cards, 'c1');
        if (deletedSlot !== undefined) cardsService.slotContentService.clearSlotContent(deletedSlot);
        db.flush();
        expect(isOIMSlotReleased(card)).toBe(true);
    });

    it('never: a collection keeps a slot through holds and a delete under a database that releases at unhold', () => {
        const defaults = new OIMDefaults({ slotReleasePolicy: new OIMSlotAtUnholdReleasePolicy() });
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard>({ defaults }), slotReleasePolicy: new OIMSlotNeverReleasePolicy() });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        const cardSlot = cardsService.holdSlotByKey(cards, 'c1');
        cardSlot.owner.unholdSlot(cardSlot);
        const deletedSlot = cardsService.peekSlotByKey(cards, 'c1');
        if (deletedSlot !== undefined) cardsService.slotContentService.clearSlotContent(deletedSlot);
        db.flush();

        expect(isOIMSlotReleased(card)).toBe(false);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(card);
        expect(cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'two' })).toBe(card);
    });

    it('after write: a row goes once its write is older than the window', () => {
        let ms = START;
        const slotReleasePolicy = new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 30_000 });
        const defaults = new OIMDefaults({ slotReleasePolicy });
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER });
        const slotReleaseWheel = mintOIMAfterWriteSlotReleaseWheel(db.collectorSlot);
        const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard>({ defaults }) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        ms = START + 29_000;
        slotReleaseWheel.flush();
        expect(isOIMSlotReleased(card)).toBe(false);
        ms = START + 31_000;
        slotReleaseWheel.flush();
        expect(isOIMSlotReleased(card)).toBe(true);
    });

    it('after idle: a row goes once nothing has watched it for the window', () => {
        let ms = START;
        const slotReleasePolicy = new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: 5_000 });
        const defaults = new OIMDefaults({ slotReleasePolicy });
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER });
        const slotReleaseWheel = mintOIMAfterIdleSlotReleaseWheel(db.collectorSlot);
        const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard>({ defaults }) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => undefined, [card]);
        db.flush();
        ms = START + 60_000;
        slotReleaseWheel.flush();
        expect(isOIMSlotReleased(card)).toBe(false);
        OIMEffectService.INSTANCE.disposeEffect(effect);
        ms = START + 64_000;
        slotReleaseWheel.flush();
        expect(isOIMSlotReleased(card)).toBe(false);
        ms = START + 66_000;
        slotReleaseWheel.flush();
        expect(isOIMSlotReleased(card)).toBe(true);
    });

    it('at unhold: a bucket with slots goes at its last unhold', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const decksService = createDecksService(new OIMSlotAtUnholdReleasePolicy());
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd1');
        decksService.slotContentService.writeSlotContent(
            deck, [cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' })],
        );
        db.flush();
        deck.owner.unholdSlot(deck);
        expect(isOIMSlotReleased(deck)).toBe(true);
    });

    it('after unhold: a bucket with slots stays for the window after its last unhold, and a hold in between keeps it', () => {
        let ms = START;
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER });
        const slotReleaseWheel = mintOIMAfterUnholdSlotReleaseWheel(db.collectorSlot);
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const decksService = createDecksService(new OIMSlotAfterUnholdReleasePolicy({ keepAfterUnholdMs: 10_000 }));
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd1');
        decksService.slotContentService.writeSlotContent(
            deck, [cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' })],
        );
        db.flush();
        deck.owner.unholdSlot(deck);
        expect(isOIMSlotReleased(deck)).toBe(false);
        ms = START + 9_000;
        slotReleaseWheel.flush();
        expect(isOIMSlotReleased(deck)).toBe(false);
        deck.owner.holdSlot(deck);
        ms = START + 11_000;
        slotReleaseWheel.flush();
        expect(isOIMSlotReleased(deck)).toBe(false);
        deck.owner.unholdSlot(deck);
        ms = START + 22_000;
        slotReleaseWheel.flush();
        expect(isOIMSlotReleased(deck)).toBe(true);
    });

    it('a zero window never touches the release queue: the slot goes at the end of the frame', () => {
        const defaults = new OIMDefaults({ slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: 0 }) });
        const db = new OIMDB({ getNowMs: () => START, releaseTimer: NO_TIMER });
        const slotReleaseWheel = mintOIMAfterIdleSlotReleaseWheel(db.collectorSlot);
        const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard>({ defaults }) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        expect(slotReleaseWheel.getNextSliceNumber()).toBeUndefined();
        db.flush();
        expect(isOIMSlotReleased(card)).toBe(true);
        expect(slotReleaseWheel.getNextSliceNumber()).toBeUndefined();
    });

    it('earliest: two policies at once, the earlier deadline wins', () => {
        let ms = START;
        const slotReleasePolicy = new OIMSlotEarliestReleasePolicy([
            new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 60_000 }),
            new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: 5_000 }),
        ]);
        const defaults = new OIMDefaults({ slotReleasePolicy });
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER });
        const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard>({ defaults }) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        ms = START + 6_000;
        mintOIMAfterIdleSlotReleaseWheel(db.collectorSlot).flush();
        expect(isOIMSlotReleased(card)).toBe(true);
    });
});
