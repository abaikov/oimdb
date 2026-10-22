import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMSlotStoreServiceMapDriven } from '../../store/OIMSlotStoreServiceMapDriven';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import type { TOIMComputedSlot } from '../../computed/types/TOIMComputedSlot';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import { oimIsSlotEmpty } from '../../slot/utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type Card = { id: string; title: string; rank: number };

const effectService = OIMEffectService.INSTANCE;

const createRankService = () => createOIMComputedService<void, number>({
    computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
    sameValueGuard: oimSameValueZeroGuard,
    columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
});

type TRankService = ReturnType<typeof createRankService>;

const valueOf = (service: TRankService, storeSlot: ReturnType<TRankService['createComputedStoreSlot']>): number =>
    service.computedCollectionService.slotContentService.getValueForSlot(
        service.computedCollectionService.getSlotByKey(storeSlot, undefined),
    );

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('a write wakes the effects of the slot it touched, once', () => {
    it('runs the body on the flush and not on the write', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;

        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A2', rank: 1 });
        expect(runs).toBe(0);
        db.flush();
        expect(runs).toBe(1);

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A3', rank: 1 });
        expect(runs).toBe(1);
        db.flush();
        expect(runs).toBe(2);
    });

    it('runs once for a batch of writes to the same slot', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;
        let runs = 0;
        effectService.createEffect(db, [slot], [], () => { runs++; });
        db.flush();
        runs = 0;

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A2', rank: 1 });
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A3', rank: 1 });
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A4', rank: 1 });
        db.flush();
        expect(runs).toBe(1);
    });

    it('runs once for one frame however many of its roots moved', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        cardsService.slotContentService.upsertEntity(cards, { id: 'b', title: 'B', rank: 2 });
        const a = cardsService.getSlotByKey(cards, 'a')!;
        const b = cardsService.getSlotByKey(cards, 'b')!;
        let runs = 0;
        effectService.createEffect(db, [a, b], [], () => { runs++; });
        db.flush();
        runs = 0;

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A2', rank: 1 });
        cardsService.slotContentService.upsertEntity(cards, { id: 'b', title: 'B2', rank: 2 });
        db.flush();
        // The stamp is the dedup: reached through two roots, listed once.
        expect(runs).toBe(1);
    });

    it('does not run a detached effect that a write had already listed', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;
        let runs = 0;
        const effect = effectService.createEffect(db, [slot], [], () => { runs++; });
        db.flush();
        runs = 0;

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A2', rank: 1 });
        // Listed by the write above, then let go of before the flush. `dispose`
        // writes -1 over the stamp, which the flush checks again before calling.
        effectService.disposeEffect(effect);
        db.flush();
        expect(runs).toBe(0);
    });

    it('takes the effect out of every root it was registered in', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;
        const effect = effectService.createEffect(db, [slot], [], () => { /* nothing */ });
        expect(slot.effects?.length).toBe(1);
        effectService.disposeEffect(effect);
        expect(slot.effects?.length).toBe(0);
    });
});

describe('a removed slot is let go of by the last thing that referred to it', () => {
    // A column subscriber is a reference to the SLOT one indirection out, and
    // `OIMColumnOwner.unsubscribe` is the only door that sees it depart.
    it('keeps a removed slot filed while a column of it is watched', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;
        const columnEffect = effectService.createEffect(db, [cardsService.getColumn(slot, 'rank')], [], () => { /* nothing */ });
        db.flush();

        cardsService.slotContentService.deleteEntity(slot);
        db.flush();

        // No value, no hold, nothing subscribed to the slot itself — and still
        // filed, because the column is watched.
        expect(oimIsSlotEmpty(slot)).toBe(true);
        expect(slot.holdCount).toBe(0);
        expect(slot.effects?.length ?? 0).toBe(0);
        expect(cardsService.getSlotByKey(cards, 'a')).toBe(slot);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        effectService.disposeEffect(columnEffect);
        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('files a second identity for the key once the first has gone', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const first = cardsService.getSlotByKey(cards, 'a')!;
        const columnEffect = effectService.createEffect(db, [cardsService.getColumn(first, 'rank')], [], () => { /* nothing */ });
        db.flush();
        cardsService.slotContentService.deleteEntity(first);
        db.flush();
        effectService.disposeEffect(columnEffect);

        // The key was unfiled, so this is a mint and not an orphan.
        const second = cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 2 });
        expect(second).not.toBe(first);
        expect(cardsService.getSlotByKey(cards, 'a')).toBe(second);
    });
});

describe('a computed absorbs a move its consumer does not have to hear about', () => {
    it('does not run the body when the derived value held', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;

        let derivations = 0;
        const rankService = createRankService();
        const rank = rankService.createComputedStoreSlot(
            db,
            () => { derivations++; return slot.entity?.rank ?? -1; },
            () => ({ sourceSlots: [slot] }),
        );

        let runs = 0;
        effectService.createEffect(db, [], [rankService.computedCollectionService.getSlotByKey(rank, undefined)], () => { runs++; });

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 2 });
        db.flush();
        expect(runs).toBe(1);
        expect(derivations).toBe(1);

        // The TITLE changed; the rank did not. The effect is woken, and its body
        // is not run, because nothing it reads is different.
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A2', rank: 2 });
        db.flush();
        expect(derivations).toBe(2);
        expect(runs).toBe(1);

        // And when the rank does move, it runs.
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A2', rank: 7 });
        db.flush();
        expect(runs).toBe(2);
    });

    it('wakes a leaf through a chain of computeds', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;

        const rankService = createRankService();
        const rank = rankService.createComputedStoreSlot(
            db,
            () => slot.entity?.rank ?? -1,
            () => ({ sourceSlots: [slot] }),
        );
        const doubledService = createRankService();
        const doubled = doubledService.createComputedStoreSlot(
            db,
            () => valueOf(rankService, rank) * 2,
            () => ({ sourceComputeds: [rankService.computedCollectionService.getSlotByKey(rank, undefined)] }),
        );

        let seen = -1;
        effectService.createEffect(db, [], [doubledService.computedCollectionService.getSlotByKey(doubled, undefined)], () => { seen = valueOf(doubledService, doubled); });

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 2 });
        db.flush();
        expect(seen).toBe(4);

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 5 });
        db.flush();
        expect(seen).toBe(10);
    });
});
