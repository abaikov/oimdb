import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMSlotMapStoreService } from '../../store/OIMSlotMapStoreService';
import { isOIMSameValueZero } from '../../slot/utils/isOIMSameValueZero';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import { isOIMSlotEmpty } from '../../slot/utils/isOIMSlotEmpty';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../computed/createOIMSingleComputedService';
import type { TOIMComputedContentSlot } from '../../computed/types/TOIMComputedContentSlot';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type Card = { id: string; title: string; rank: number };

const effectService = OIMEffectService.INSTANCE;

const createRankService = () => createOIMSingleComputedService<number>({ sameValueGuard: isOIMSameValueZero, columnSlotStoreService: new OIMSlotMapStoreService<TOIMComputedColumnSlot, string>() });

type TRankService = ReturnType<typeof createRankService>;

const valueOf = (service: TRankService, storeSlot: ReturnType<TRankService['createStoreSlot']>): number =>
    readValueWithoutTracking(service.getSingleSlot(storeSlot) as TOIMComputedContentSlot<number>);

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card, string>() });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('a write wakes the effects of the slot it touched, once', () => {
    it('runs the body on the flush and not on the write', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;

        let runs = 0;
        effectService.createEffect(db, () => { runs++; }, [slot]);

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A2', rank: 1 });
        expect(runs).toBe(0);
        db.flush();
        expect(runs).toBe(1);
        expect(slot.entity?.title).toBe('A2');

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A3', rank: 1 });
        expect(runs).toBe(1);
        db.flush();
        expect(runs).toBe(2);
    });

    it('runs once for a batch of writes to the same slot', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;
        let runs = 0;
        effectService.createEffect(db, () => { runs++; }, [slot]);
        db.flush();
        runs = 0;

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A2', rank: 1 });
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A3', rank: 1 });
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A4', rank: 1 });
        db.flush();
        expect(runs).toBe(1);
    });
});

describe('a removed slot is let go of by the last thing that referred to it', () => {
    // A column subscriber is a reference to the SLOT one indirection out, and
    // `OIMColumnSlotOwner.unsubscribe` is the only door that sees it depart.
    it('keeps a removed slot filed while a column of it is watched', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;
        const columnEffect = effectService.createEffect(db, () => { /* nothing */ }, [cardsService.columnSlotService.getColumnSlot(slot, 'rank')]);
        db.flush();

        cardsService.slotContentService.clearSlotContent(slot);
        db.flush();

        // No value, no hold, nothing subscribed to the slot itself — and still
        // filed, because the column is watched.
        expect(isOIMSlotEmpty(slot)).toBe(true);
        expect(slot.holdCount).toBe(0);
        expect(slot.effects?.length ?? 0).toBe(0);
        expect(cardsService.getSlotByKey(cards, 'a')).toBe(slot);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        effectService.disposeEffect(columnEffect);
        expect(isOIMSlotReleased(slot)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('files a second identity for the key once the first has gone', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 1 });
        const first = cardsService.getSlotByKey(cards, 'a')!;
        const columnEffect = effectService.createEffect(db, () => { /* nothing */ }, [cardsService.columnSlotService.getColumnSlot(first, 'rank')]);
        db.flush();
        cardsService.slotContentService.clearSlotContent(first);
        db.flush();
        effectService.disposeEffect(columnEffect);

        // The key was unfiled, so this is a mint and not an orphan.
        const second = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 2 });
        expect(second).not.toBe(first);
        expect(cardsService.getSlotByKey(cards, 'a')).toBe(second);
    });
});

describe('a computed absorbs a move its consumer does not have to hear about', () => {
    it('does not run the body when the derived value held', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;

        let derivations = 0;
        const rankService = createRankService();
        const rank = rankService.createStoreSlot(
            db,
            () => { derivations++; return slot.entity?.rank ?? -1; },
            () => ({ sourceSlots: [slot] }),
        );

        let runs = 0;
        effectService.createEffect(db, () => { runs++; }, [], [rankService.getSingleSlot(rank)]);

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 2 });
        db.flush();
        expect(runs).toBe(1);
        expect(derivations).toBe(1);

        // The TITLE changed; the rank did not. The effect is woken, and its body
        // is not run, because nothing it reads is different.
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A2', rank: 2 });
        db.flush();
        expect(derivations).toBe(2);
        expect(runs).toBe(1);

        // And when the rank does move, it runs.
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A2', rank: 7 });
        db.flush();
        expect(runs).toBe(2);
    });

    it('wakes a leaf through a chain of computeds', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards, 'a')!;

        const rankService = createRankService();
        const rank = rankService.createStoreSlot(
            db,
            () => slot.entity?.rank ?? -1,
            () => ({ sourceSlots: [slot] }),
        );
        const doubledService = createRankService();
        const doubled = doubledService.createStoreSlot(
            db,
            () => valueOf(rankService, rank) * 2,
            () => ({ sourceComputeds: [rankService.getSingleSlot(rank)] }),
        );

        let seen = -1;
        effectService.createEffect(db, () => { seen = valueOf(doubledService, doubled); }, [], [doubledService.getSingleSlot(doubled)]);

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 2 });
        db.flush();
        expect(seen).toBe(4);

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 5 });
        db.flush();
        expect(seen).toBe(10);
    });
});
