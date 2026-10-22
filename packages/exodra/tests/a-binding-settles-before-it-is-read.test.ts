import {
    OIMSlotStoreServiceMapDriven, OIMSlotStoreServiceSingleSlotDriven, createOIMComputedService, oimSameValueZeroGuard,
} from '@oimdb/core';
import type { TOIMComputedColumnSlot, TOIMComputedSlot, TOIMSingleSlotStore } from '@oimdb/core';
import { exoBinding } from '../src/exoBinding';
import { build } from './support/build';

const createTitleService = () => createOIMComputedService<void, string, TOIMSingleSlotStore<TOIMComputedSlot<string, void>>>({
    computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<string, void>>(),
    sameValueGuard: oimSameValueZeroGuard,
    columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
});

/**
 * `exoBinding` is the whole of what this package takes from `@oimdb/core`, so
 * these cases are the ones that would otherwise be repeated at every call site —
 * which is exactly the argument for the function existing.
 */
describe('exoBinding', () => {
    it('binds a row, a bucket\'s slots and a derivation with the same call', () => {
        const world = build();
        const slot = world.slotOf({ id: 'c1', deckId: 'd1', rank: 1, title: 'alpha' });
        const bucket = world.bucketOf(world.byDeckService, world.byDeck, 'd1');
        world.byDeckService.slotContentService.writeBucketMemberSlots(bucket, [slot]);
        world.db.flush();

        const row = exoBinding(world.db, {
            sourceSlots: [slot], derive: () => slot.entity,
        });
        const inBucket = exoBinding(world.db, {
            sourceSlots: [bucket],
            derive: () => Array.from(world.byDeckService.slotContentService.getBucketMemberSlots(bucket)),
        });
        const titleService = createTitleService();
        const title = titleService.createComputedStoreSlot(
            world.db,
            () => (slot.entity?.title ?? '').toUpperCase(),
            () => ({ sourceSlots: [slot] }),
        );
        const titleSlot = titleService.computedCollectionService.holdSlotByKey(title, undefined);
        const shouted = exoBinding(world.db, {
            sourceComputeds: [titleSlot], derive: () => titleService.computedCollectionService.slotContentService.getValueForSlot(titleSlot),
        });

        expect(row.getValue()?.title).toBe('alpha');
        expect(inBucket.getValue()).toHaveLength(1);
        expect(shouted.getValue()).toBe('ALPHA');
    });

    /**
     * A derivation is ASKED and never woken, so `computed.value` on its own is
     * whatever the last settle left there — for a fresh one, the value it was
     * born with. This is the read `exoBinding` owns, and the reason a consumer
     * writing the pair by hand gets a stale answer with nothing thrown.
     */
    it('settles every derivation before the read, even with nobody subscribed', () => {
        const world = build();
        const slot = world.slotOf({ id: 'c1', deckId: 'd1', rank: 1, title: 'alpha' });
        let derivations = 0;
        const titleService = createTitleService();
        const title = titleService.createComputedStoreSlot(
            world.db,
            () => { derivations++; return slot.entity?.title ?? ''; },
            () => ({ sourceSlots: [slot] }),
        );
        const titleSlot = titleService.computedCollectionService.holdSlotByKey(title, undefined);
        const bound = exoBinding(world.db, {
            sourceComputeds: [titleSlot], derive: () => titleService.computedCollectionService.slotContentService.getValueForSlot(titleSlot),
        });

        expect(bound.getValue()).toBe('alpha');
        expect(derivations).toBe(1);

        world.updateCard('c1', { title: 'beta' });
        world.db.flush();
        // Never subscribed, and still current: the read is what settles it.
        expect(bound.getValue()).toBe('beta');
        expect(derivations).toBe(2);

        // A settle whose sources are quiet costs comparisons and no body.
        expect(bound.getValue()).toBe('beta');
        expect(derivations).toBe(2);
    });

    it('propagates once per frame, however many writes landed', () => {
        const world = build();
        const slot = world.slotOf({ id: 'c1', deckId: 'd1', rank: 1, title: 'alpha' });
        world.db.flush();

        const row = exoBinding(world.db, {
            sourceSlots: [slot], derive: () => slot.entity,
        });
        let runCount = 0;
        row.subscribe(() => { runCount++; });

        world.updateCard('c1', { title: 'alpha-1' });
        world.updateCard('c1', { title: 'alpha-2' });
        world.db.flush();

        expect(runCount).toBe(1);
        expect(row.getValue()?.title).toBe('alpha-2');
    });

    /**
     * The ref-counting is `exoSource`'s, and this is what it buys against the
     * engine: `slot.effects` is the list a write walks, so a second subscriber
     * that armed a second effect would double the cost of every write to this
     * row.
     */
    it('arms one effect for however many subscribers, and none while nobody listens', () => {
        const world = build();
        const slot = world.slotOf({ id: 'c1', deckId: 'd1', rank: 1, title: 'alpha' });
        world.db.flush();
        const row = exoBinding(world.db, {
            sourceSlots: [slot], derive: () => slot.entity,
        });

        expect(slot.effects?.length ?? 0).toBe(0);

        let first = 0, second = 0;
        const offFirst = row.subscribe(() => { first++; });
        const offSecond = row.subscribe(() => { second++; });
        expect(slot.effects?.length).toBe(1);

        world.updateCard('c1', { title: 'beta' });
        world.db.flush();
        expect(first).toBe(1);
        expect(second).toBe(1);

        offFirst();
        expect(slot.effects?.length).toBe(1);
        offSecond();
        expect(slot.effects?.length).toBe(0);
    });

    it('stops notifying once unbound, and getValue still reads live', () => {
        const world = build();
        const slot = world.slotOf({ id: 'c1', deckId: 'd1', rank: 1, title: 'alpha' });
        world.db.flush();
        const row = exoBinding(world.db, {
            sourceSlots: [slot], derive: () => slot.entity,
        });

        let runCount = 0;
        const off = row.subscribe(() => { runCount++; });
        world.updateCard('c1', { title: 'beta' });
        world.db.flush();
        expect(runCount).toBe(1);

        off();
        world.updateCard('c1', { title: 'gamma' });
        world.db.flush();
        expect(runCount).toBe(1);
        expect(row.getValue()?.title).toBe('gamma');
    });

    /**
     * `OIMEffectService.disposeEffect` is a prototype method reading `this`, so a disposer
     * built as `return effectService.disposeEffect` type-checks and throws when it runs. The
     * wrapping is `exoBinding`'s, and this is the case that would have found it.
     */
    it('unbinding does not throw, which is the whole of the dispose wrapping', () => {
        const world = build();
        const slot = world.slotOf({ id: 'c1', deckId: 'd1', rank: 1, title: 'alpha' });
        const row = exoBinding(world.db, {
            sourceSlots: [slot], derive: () => slot.entity,
        });
        const off = row.subscribe(() => { /* the emit is not what this pins */ });
        expect(() => off()).not.toThrow();
    });

    /**
     * A bucket's order is a derivation, and it is what a consumer subscribes to
     * instead of the bucket when the order is the engine's: its value comes back
     * BY IDENTITY while the order holds, so a memo on identity needs no
     * comparison of its own.
     */
    it('binds the order of a bucket, and holds the array still while the order holds', () => {
        const world = build();
        const deckSlot = world.rankedOrdersService.holdSlotByKey(world.rankedOrders, 'spades');
        world.cardsService.slotContentService.upsertEntities(world.cards, [
            { id: 'c2', deckId: 'spades', rank: 2, title: 'two' },
            { id: 'c1', deckId: 'spades', rank: 1, title: 'one' },
        ]);
        world.db.flush();

        const bound = exoBinding(world.db, {
            sourceComputeds: [deckSlot], derive: () => deckSlot.computedValueService.getValueForSlot(deckSlot),
        });

        const first = bound.getValue();
        expect(first.map(slot => slot.entity?.id)).toEqual(['c1', 'c2']);
        // Nothing moved, so the very same array.
        expect(bound.getValue()).toBe(first);

        let runCount = 0;
        const off = bound.subscribe(() => { runCount++; });

        world.updateCard('c1', { title: 'ONE' });
        world.db.flush();
        expect(bound.getValue()).toBe(first);

        world.updateCard('c2', { deckId: 'hearts' });
        world.db.flush();
        expect(runCount).toBeGreaterThan(0);
        expect(bound.getValue().map(slot => slot.entity?.id)).toEqual(['c1']);

        off();
        deckSlot.owner.unholdSlot(deckSlot);
    });
});
