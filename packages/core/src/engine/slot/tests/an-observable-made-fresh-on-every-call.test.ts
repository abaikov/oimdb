import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';

import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { oimSameValueZeroGuard } from '../utils/oimSameValueZeroGuard';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import type { TOIMSingleSlotStore } from '../../store/types/TOIMSingleSlotStore';
import type { TOIMComputedSlot } from '../../computed/types/TOIMComputedSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; deckId: string; title: string };

/**
 * One card, one bucket holding it, and one collection of derivations over the
 * cards. The bucket is filled BY HAND, because a bucket's slots are the caller's:
 * nothing a write does puts a slot in a bucket.
 */
const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMBucketService<
        TOIMEntitySlot<TCard>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard>>,
        OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>() });
    let builds = 0;
    const titleLengthsService = createOIMComputedService<string, number>({
        // `createSources` names its sources and takes no holds: `OIMComputedCollection`
        // .createSlot holds every one after this returns, and gives them back.
        createSources: (id: string) => {
            builds++;
            return { sourceSlots: [cardsService.getSlotByKey(cards, id)] };
        },
        derive: (computedSlot) => (cardsService.getSlotByKey(cards, computedSlot.key).entity?.title ?? '').length,
        sameValueGuard: oimSameValueZeroGuard,
    });
    const titleLengths = titleLengthsService.createComputedStoreSlot(db);

    cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'spades', title: 'ace' });
    db.flush();
    const slot = cardsService.getSlotByKey(cards, 'c1')!;
    const byDeck = byDeckService.createStoreSlot(db);
    const heldSlot = byDeckService.holdSlotByKey(byDeck, 'spades');
    byDeckService.slotContentService.writeBucketMemberSlots(heldSlot, [slot]);

    return {
        db, cards, cardsService, byDeck, byDeckService,
        titleLengths, titleLengthsService, slot, bucket: heldSlot, builds: () => builds,
    };
};

describe('a graph node is built fresh per call, and could not be otherwise', () => {
    it('gives every effect its own identity in the graph', () => {
        const { db, slot } = createFixture();

        const body = (): void => { /* the same closure, twice */ };
        const first = OIMEffectService.INSTANCE.createEffect(db, [slot], [], body);
        const second = OIMEffectService.INSTANCE.createEffect(db, [slot], [], body);

        expect(first).not.toBe(second);
        // Two nodes, and both filed on the root: an interned effect would be one
        // entry here and one of the two callers would never be woken.
        expect(slot.effects?.length).toBe(2);

        OIMEffectService.INSTANCE.disposeEffect(first);
        OIMEffectService.INSTANCE.disposeEffect(second);
    });

    /**
     * The one that makes interning a derivation impossible rather than merely
     * unwanted: each call allocates a node with a value cell and a pair of
     * clock readings of its own, so two calls are two nodes before anything is
     * returned, and nothing about the arguments could key a table — a fresh
     * array and a fresh closure.
     *
     * AND IT DOES NOT RUN ON THE WAY PAST: a derivation is produced on the read
     * that asks for it, so two constructions derive nothing at all.
     */
    it('gives every derivation its own identity, and derives nothing to do it', () => {
        const { db, slot } = createFixture();

        let runs = 0;
        const derive = (): number => { runs++; return 1; };
        const createDerivation = () => {
            const derivationService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
                computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
                sameValueGuard: oimSameValueZeroGuard,
            });
            const derivation = derivationService.createComputedStoreSlot(db, derive, () => ({ sourceSlots: [slot] }));
            return { derivationService, derivation };
        };
        const first = createDerivation();
        const second = createDerivation();

        expect(first.derivationService.computedCollectionService.getSlotByKey(first.derivation, undefined))
            .not.toBe(second.derivationService.computedCollectionService.getSlotByKey(second.derivation, undefined));
        expect(runs).toBe(0);
    });
});

describe('an identity is the same object every time, and a read of an untaken key files one', () => {
    /**
     * A column is an identity of its own, minted inside the
     * subscription and filed on the slot by name, so the two columns of one row
     * are two objects and a binding keyed on the column identity is keyed on the
     * column.
     */
    it('gives each column of one slot an identity of its own', () => {
        const { db, cardsService, slot } = createFixture();

        const onTitle = OIMEffectService.INSTANCE.createEffect(
            db, [cardsService.getColumn(slot, 'title')], [], () => { /* nothing */ });
        const onDeck = OIMEffectService.INSTANCE.createEffect(
            db, [cardsService.getColumn(slot, 'deckId')], [], () => { /* nothing */ });

        const title = (slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.get('title');
        const deck = (slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.get('deckId');
        expect(title).toBeDefined();
        expect(deck).toBeDefined();
        expect(title).not.toBe(deck);
        // And each is the same identity on the next ask: a second subscriber to
        // one column joins the one that is filed rather than minting a second.
        const alsoOnTitle = OIMEffectService.INSTANCE.createEffect(
            db, [cardsService.getColumn(slot, 'title')], [], () => { /* nothing */ });
        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.get('title')).toBe(title);
        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.size).toBe(2);

        OIMEffectService.INSTANCE.disposeEffect(onTitle);
        OIMEffectService.INSTANCE.disposeEffect(onDeck);
        OIMEffectService.INSTANCE.disposeEffect(alsoOnTitle);
    });

    /**
     * THE BUCKET HALF, and the reason `db.slots` needed no interning of its
     * own. Two holds of one key answer with the one bucket and count two
     * references on it, so one give-back cannot let go of what the other holds.
     */
    it('counts a hold per resolve of one key over the one bucket', () => {
        const { byDeck, byDeckService, bucket } = createFixture();

        const resolvedOnceSlot = byDeckService.holdSlotByKey(byDeck, 'spades');
        const resolvedTwiceSlot = byDeckService.holdSlotByKey(byDeck, 'spades');
        expect(resolvedOnceSlot).toBe(bucket);
        expect(resolvedTwiceSlot).toBe(bucket);
        // Three: the one `build` took and one for each resolve.
        expect(bucket.holdCount).toBe(3);

        resolvedOnceSlot.owner.unholdSlot(resolvedOnceSlot);
        expect(bucket.holdCount).toBe(2);
        resolvedTwiceSlot.owner.unholdSlot(resolvedTwiceSlot);
        expect(bucket.holdCount).toBe(1);
        bucket.owner.unholdSlot(bucket);
    });
});

describe('where the key is a fact rather than a closure, the engine interns', () => {
    it('hands the same derivation back for one key, and builds it once', () => {
        const { titleLengths, titleLengthsService, builds } = createFixture();

        const firstSlot = titleLengthsService.computedCollectionService.holdSlotByKey(titleLengths, 'c1');
        const secondSlot = titleLengthsService.computedCollectionService.holdSlotByKey(titleLengths, 'c1');
        expect(secondSlot).toBe(firstSlot);
        expect(builds()).toBe(1);
        expect(titleLengthsService.computedCollectionService.getSlotCount(titleLengths)).toBe(1);

        firstSlot.owner.unholdSlot(firstSlot);
        secondSlot.owner.unholdSlot(secondSlot);
    });

    /**
     * WHAT THE INTERNING COSTS THE CALLER, stated as an assertion because it is
     * the whole of the difference from a table the engine keeps for ever: the
     * derivation is filed for exactly as long as something holds it or reads it,
     * and it takes its own source's hold with it when it goes.
     */
    it('lets the derivation and its source go when the last hold is given back', () => {
        const { db, cards, cardsService, titleLengths, titleLengthsService } = createFixture();

        const heldSlot = titleLengthsService.computedCollectionService.holdSlotByKey(titleLengths, 'c2');
        const source = cardsService.getSlotByKey(cards, 'c2')!;
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(source.holdCount).toBe(1);

        heldSlot.owner.unholdSlot(heldSlot);
        expect(titleLengthsService.computedCollectionService.getSlotCount(titleLengths)).toBe(0);
        expect(source.holdCount).toBe(0);
        expect(oimIsSlotReleased(source)).toBe(true);
    });
});

/**
 * WHAT THE DECISION DOES NOT COST, pinned so that "no interning" is not read as
 * a defect left standing. Two subscriptions over one identity are two handles to
 * one identity, not two subscriptions with different opinions: they read the
 * same value and they wake together. What was ever missing is the HANDLE's
 * identity, and that was only ever a binding's problem.
 */
describe('two readers of one identity behave as one', () => {
    it('wakes both, on the same value, from one write', () => {
        const { db, cardsService, slot } = createFixture();

        let oneWoke = 0;
        let twoWoke = 0;
        const one = OIMEffectService.INSTANCE.createEffect(
            db, [cardsService.getColumn(slot, 'title')], [], () => { oneWoke++; });
        const two = OIMEffectService.INSTANCE.createEffect(
            db, [cardsService.getColumn(slot, 'title')], [], () => { twoWoke++; });
        db.flush();
        oneWoke = 0;
        twoWoke = 0;

        cardsService.slotContentService.updateEntity(slot, { title: 'king' });
        db.flush();

        expect(slot.entity?.title).toBe('king');
        expect(oneWoke).toBe(1);
        expect(twoWoke).toBe(1);

        OIMEffectService.INSTANCE.disposeEffect(one);
        OIMEffectService.INSTANCE.disposeEffect(two);
    });
});
