import { OIMDB, OIMEffectService, oimMintAfterIdleSlotReleaseWheel, oimMintAfterUnholdSlotReleaseWheel, oimMintAfterWriteSlotReleaseWheel, OIMSlotContentSetBucketService, OIMSlotAfterIdleReleasePolicy, OIMSlotAfterUnholdReleasePolicy, OIMSlotAfterWriteReleasePolicy, OIMSlotAtEmptyReleasePolicy, OIMSlotAtUnholdReleasePolicy, OIMSlotEarliestReleasePolicy, OIMSlotNeverReleasePolicy, oimIsSlotReleased } from '../../../index';
import type { IOIMSlotReleasePolicy, TOIMEntitySlot } from '../../../index';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const START = 1_000_000;
const NO_TIMER = (): (() => void) => () => undefined;

const createFixture = (slotReleasePolicy: IOIMSlotReleasePolicy | undefined) => {
    let ms = START;
    const db = new OIMDB({ slotReleasePolicy });
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards, at: (value: number): void => { ms = value; }, nowMs: (): number => ms };
};

const createDecksService = (db: OIMDB, slotReleasePolicy: IOIMSlotReleasePolicy) => createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TCardSlot>(), slotReleasePolicy });

describe('one release policy decides when a slot goes', () => {
    it('with no policy, a row with a value stays for good', () => {
        const fixture = createFixture(undefined);
        const card = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();
        fixture.at(START + 10 ** 9);
        fixture.db.flush();
        expect(oimIsSlotReleased(card)).toBe(false);
    });

    it('with no policy, no write asks OIMSlotAtEmptyReleasePolicy anything, because it schedules no release on write', () => {
        const onSlotWritten = jest.spyOn(OIMSlotAtEmptyReleasePolicy.prototype, 'onSlotWritten');
        try {
            const fixture = createFixture(undefined);
            fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
            const card = fixture.cardsService.findSlotByKey(fixture.cards, 'c1');
            if (card !== undefined) fixture.cardsService.slotContentService.updateEntity(card, { title: 'two' });
            expect(onSlotWritten).toHaveBeenCalledTimes(0);
        } finally {
            onSlotWritten.mockRestore();
        }
    });

    it('at empty: a collection keeps a filled slot through holds under a database that releases at unhold, and lets a deleted one go', () => {
        const db = new OIMDB({ slotReleasePolicy: new OIMSlotAtUnholdReleasePolicy() });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db), slotReleasePolicy: new OIMSlotAtEmptyReleasePolicy() });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        const cardSlot = cardsService.holdSlotByKey(cards, 'c1');
        cardSlot.owner.unholdSlot(cardSlot);
        db.flush();
        expect(oimIsSlotReleased(card)).toBe(false);

        const deletedSlot = cardsService.findSlotByKey(cards, 'c1');
        if (deletedSlot !== undefined) cardsService.slotContentService.clearSlotContent(deletedSlot);
        db.flush();
        expect(oimIsSlotReleased(card)).toBe(true);
    });

    it('never: a collection keeps a slot through holds and a delete under a database that releases at unhold', () => {
        const db = new OIMDB({ slotReleasePolicy: new OIMSlotAtUnholdReleasePolicy() });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db), slotReleasePolicy: new OIMSlotNeverReleasePolicy() });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        const cardSlot = cardsService.holdSlotByKey(cards, 'c1');
        cardSlot.owner.unholdSlot(cardSlot);
        const deletedSlot = cardsService.findSlotByKey(cards, 'c1');
        if (deletedSlot !== undefined) cardsService.slotContentService.clearSlotContent(deletedSlot);
        db.flush();

        expect(oimIsSlotReleased(card)).toBe(false);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(card);
        expect(cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'two' })).toBe(card);
    });

    it('after write: a row goes once its write is older than the window', () => {
        let ms = START;
        const slotReleasePolicy = new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 30_000 });
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER, slotReleasePolicy });
        const slotReleaseWheel = oimMintAfterWriteSlotReleaseWheel(db.collectorSlot);
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        ms = START + 29_000;
        slotReleaseWheel.flush();
        expect(oimIsSlotReleased(card)).toBe(false);
        ms = START + 31_000;
        slotReleaseWheel.flush();
        expect(oimIsSlotReleased(card)).toBe(true);
    });

    it('after idle: a row goes once nothing has watched it for the window', () => {
        let ms = START;
        const slotReleasePolicy = new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: 5_000 });
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER, slotReleasePolicy });
        const slotReleaseWheel = oimMintAfterIdleSlotReleaseWheel(db.collectorSlot);
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        const effect = OIMEffectService.INSTANCE.createEffect(db, [card], [], () => undefined);
        db.flush();
        ms = START + 60_000;
        slotReleaseWheel.flush();
        expect(oimIsSlotReleased(card)).toBe(false);
        OIMEffectService.INSTANCE.disposeEffect(effect);
        ms = START + 64_000;
        slotReleaseWheel.flush();
        expect(oimIsSlotReleased(card)).toBe(false);
        ms = START + 66_000;
        slotReleaseWheel.flush();
        expect(oimIsSlotReleased(card)).toBe(true);
    });

    it('at unhold: a bucket with slots goes at its last unhold', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const decksService = createDecksService(db, new OIMSlotAtUnholdReleasePolicy());
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd1');
        decksService.slotContentService.writeSlotContent(
            deck, [cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' })],
        );
        db.flush();
        deck.owner.unholdSlot(deck);
        expect(oimIsSlotReleased(deck)).toBe(true);
    });

    it('after unhold: a bucket with slots stays for the window after its last unhold, and a hold in between keeps it', () => {
        let ms = START;
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER });
        const slotReleaseWheel = oimMintAfterUnholdSlotReleaseWheel(db.collectorSlot);
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const decksService = createDecksService(db, new OIMSlotAfterUnholdReleasePolicy({ keepAfterUnholdMs: 10_000 }));
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd1');
        decksService.slotContentService.writeSlotContent(
            deck, [cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' })],
        );
        db.flush();
        deck.owner.unholdSlot(deck);
        expect(oimIsSlotReleased(deck)).toBe(false);
        ms = START + 9_000;
        slotReleaseWheel.flush();
        expect(oimIsSlotReleased(deck)).toBe(false);
        deck.owner.holdSlot(deck);
        ms = START + 11_000;
        slotReleaseWheel.flush();
        expect(oimIsSlotReleased(deck)).toBe(false);
        deck.owner.unholdSlot(deck);
        ms = START + 22_000;
        slotReleaseWheel.flush();
        expect(oimIsSlotReleased(deck)).toBe(true);
    });

    it('a zero window never touches the release queue: the slot goes at the end of the frame', () => {
        const db = new OIMDB({
            getNowMs: () => START,
            releaseTimer: NO_TIMER,
            slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: 0 }),
        });
        const slotReleaseWheel = oimMintAfterIdleSlotReleaseWheel(db.collectorSlot);
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        expect(slotReleaseWheel.getNextSliceNumber()).toBeUndefined();
        db.flush();
        expect(oimIsSlotReleased(card)).toBe(true);
        expect(slotReleaseWheel.getNextSliceNumber()).toBeUndefined();
    });

    it('earliest: two policies at once, the earlier deadline wins', () => {
        let ms = START;
        const slotReleasePolicy = new OIMSlotEarliestReleasePolicy([
            new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 60_000 }),
            new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: 5_000 }),
        ]);
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: NO_TIMER, slotReleasePolicy });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        ms = START + 6_000;
        oimMintAfterIdleSlotReleaseWheel(db.collectorSlot).flush();
        expect(oimIsSlotReleased(card)).toBe(true);
    });
});
