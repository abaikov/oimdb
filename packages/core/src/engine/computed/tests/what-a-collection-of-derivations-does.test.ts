import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import { oimIsSlotEmpty } from '../../slot/utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';

type Card = { id: string; title: string; rank: number };

const createNumberService = () => {
    const computedService = createOIMComputedService<void, number>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        sameValueGuard: oimSameValueZeroGuard,
    });
    const collectionService = computedService.computedCollectionService;
    type TStoreSlot = Parameters<typeof collectionService.getSlotByKey>[0];
    return {
        createComputedStoreSlot: computedService.createComputedStoreSlot.bind(computedService),
        getSlotByKey: (storeSlot: TStoreSlot, key: undefined) => collectionService.getSlotByKey(storeSlot, key),
        getValueByKey: (storeSlot: TStoreSlot, key: undefined) => {
            const computedSlot = collectionService.getSlotByKey(storeSlot, key);
            return computedSlot.computedValueService.getValueForSlot(computedSlot);
        },
    };
};

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    let builds = 0;
    // The ordinary shape of a build: resolve through the hold door, derive over
    // the identity it hands back, and hand the hold to `keep` — it is the
    // service's from there, and lasts as long as the derivation is filed.
    const computedService = createOIMComputedService<string, number>({
        createSources: (id: string) => {
            builds++;
            return { sourceSlots: [cardsService.getSlotByKey(cards, id)] };
        },
        derive: computedSlot => cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
        sameValueGuard: oimSameValueZeroGuard,
    });
    const ranks = computedService.createComputedStoreSlot(db);
    const flushUnusedSlots = (): void => OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
    return {
        db, effectService, cardsService, cards, ranksService: computedService.computedCollectionService, ranks,
        flushUnusedSlots, builds: () => builds,
    };
};

describe('one derivation per key, and the key is how it is found again', () => {
    it('hands the same derivation back while something holds it', () => {
        const { ranksService, ranks, builds } = createFixture();
        const firstSlot = ranksService.holdSlotByKey(ranks, 'a');
        ranksService.holdSlotByKey(ranks, 'a');
        const secondSlot = ranksService.getSlotByKey(ranks, 'a')!;
        expect(secondSlot).toBe(firstSlot);
        expect(builds()).toBe(1);
    });

    it('derives over a key that has no value yet, and picks the value up', () => {
        const { db, effectService, cardsService, cards, ranksService, ranks } = createFixture();
        expect(cardsService.getSlotCount(cards)).toBe(0);

        const rank = ranksService.holdSlotByKey(ranks, 'a');
        // Minted by `hold` inside the build, which is a door.
        expect(cardsService.getSlotCount(cards)).toBe(1);
        expect(oimIsSlotEmpty(cardsService.getSlotByKey(cards, 'a'))).toBe(true);

        let seen = 0;
        effectService.createEffect(db, [], [rank], () => { seen = rank.computedValueService.getValueForSlot(rank); });
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 4 });
        db.flush();
        expect(seen).toBe(4);
    });

    it('writes into the identity the derivation minted, not a second one', () => {
        const { cardsService, cards, ranksService, ranks } = createFixture();
        ranksService.holdSlotByKey(ranks, 'a');
        const held = cardsService.getSlotByKey(cards, 'a')!;
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        expect(cardsService.getSlotByKey(cards, 'a')).toBe(held);
    });
});

describe('a derivation is kept by a hold or a dependent, and by nothing it contains', () => {
    it('holds its own source while it is filed', () => {
        const { flushUnusedSlots, cardsService, cards, ranksService, ranks } = createFixture();
        ranksService.holdSlotByKey(ranks, 'a');
        const source = cardsService.getSlotByKey(cards, 'a');
        // The build resolved the source through `getByKey`, so the frame
        // collector is holding it too until the frame ends. What survives that
        // is the DERIVATION's own hold, and `ranks.hold` counts on the
        // derivation rather than on its source.
        flushUnusedSlots();
        expect(source.holdCount).toBe(1);
    });

    it('gives the source hold back when the last reference to it goes', () => {
        const { flushUnusedSlots, cardsService, cards, ranksService, ranks } = createFixture();
        const heldSlot = ranksService.holdSlotByKey(ranks, 'a');
        const source = cardsService.getSlotByKey(cards, 'a');
        flushUnusedSlots();
        expect(source.holdCount).toBe(1);
        expect(ranksService.getSlotCount(ranks)).toBe(1);

        heldSlot.owner.unholdSlot(heldSlot);
        // It held nothing anybody could not derive again, so it went — and its
        // hold on the source went with it.
        expect(ranksService.getSlotCount(ranks)).toBe(0);
        expect(source.holdCount).toBe(0);
    });

    it('keeps the derivation while an effect reads it', () => {
        const { db, flushUnusedSlots, effectService, cardsService, cards, ranksService, ranks } = createFixture();
        const heldSlot = ranksService.holdSlotByKey(ranks, 'a');
        const effect = effectService.createEffect(db, [], [heldSlot], () => { /* nothing */ });
        heldSlot.owner.unholdSlot(heldSlot);
        flushUnusedSlots();

        expect(ranksService.getSlotCount(ranks)).toBe(1);
        const source = cardsService.getSlotByKey(cards, 'a');
        expect(source.holdCount).toBe(2);

        effectService.disposeEffect(effect);
        expect(ranksService.getSlotCount(ranks)).toBe(0);
        expect(oimIsSlotReleased(source)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });
});

describe('a stale identity does not unfile the live one at its key', () => {
    /**
     * THE SEQUENCE IS ORDINARY, which is why the compare has to be there: a
     * derivation is released, the key is asked for again and a SECOND identity
     * is filed under it, and only then does something holding the FIRST let go.
     * Without the released-flag check in `OIMSlotOwnerService.releaseSlotIfUnheld` that give-back
     * removes the live derivation, and whoever holds it is never written to
     * again — silently.
     */
    it('declines a release asked about a slot that has already been replaced', () => {
        const { ranksService, ranks } = createFixture();
        const firstSlot = ranksService.holdSlotByKey(ranks, 'a');
        firstSlot.owner.unholdSlot(firstSlot);
        expect(ranksService.getSlotCount(ranks)).toBe(0);

        ranksService.holdSlotByKey(ranks, 'a');

        const secondSlot = ranksService.getSlotByKey(ranks, 'a')!;
        expect(secondSlot).not.toBe(firstSlot);
        expect(ranksService.getSlotCount(ranks)).toBe(1);

        // A late give-back on the FIRST one, which is what a detaching effect or
        // a slot leaving a bucket does.
        expect(() => firstSlot.owner.holdSlot(firstSlot)).toThrow(/This identity was released/);
        expect(() => firstSlot.owner.unholdSlot(firstSlot)).toThrow(/This identity was released/);
        expect(ranksService.getSlotCount(ranks)).toBe(1);
        expect(ranksService.getSlotByKey(ranks, 'a')).toBe(secondSlot);
    });
});

describe('every source of a reader is brought current, not only the first that moved', () => {
    /* THE DEFECT THIS PINS: a loop over source computeds that stops at the first one whose value moved leaves every
     * source after it unproduced, and the body is handed a reading from an older revision. */
    it('hands a body the current value of a source listed after one that moved, immediately and on every frame after', () => {
        const { db, effectService, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        db.flush();
        const slot = cardsService.getSlotByKey(cards, 'a');

        // TWO derivations over the SAME root, so one write changes both.
        const firstService = createNumberService();
        const first = firstService.createComputedStoreSlot(db, () => slot.entity?.rank ?? -1, () => ({ sourceSlots: [slot] }));
        const secondService = createNumberService();
        const second = secondService.createComputedStoreSlot(db, () => (slot.entity?.rank ?? -1) * 10, () => ({ sourceSlots: [slot] }));

        let seenFirst = 0;
        let seenSecond = 0;
        effectService.createEffectImmediate(db, [], [firstService.getSlotByKey(first, undefined), secondService.getSlotByKey(second, undefined)], () => {
            seenFirst = firstService.getValueByKey(first, undefined);
            seenSecond = secondService.getValueByKey(second, undefined);
        });
        expect([seenFirst, seenSecond]).toEqual([1, 10]);

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 2 });
        db.flush();
        expect(seenFirst).toBe(2);
        // The one a loop that breaks at the first changed source would skip.
        expect(seenSecond).toBe(20);

        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 7 });
        db.flush();
        expect(seenFirst).toBe(7);
        expect(seenSecond).toBe(70);
    });
});
