import type { TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import { exoBinding } from '../src/exoBinding';
import { exoFollowKey } from '../src/exoFollowKey';
import type { TOIMExoDisposable } from '../src/types/TOIMExoDisposable';
import type { TOIMExoReadable } from '../src/types/TOIMExoReadable';
import { build } from './support/build';
import type { TCard, TExoTestWorld } from './support/build';

function makeLocalBindable<T>(initial: T): {
    getValue(): T;
    subscribe(update: () => void): () => void;
    set(next: T): void;
} {
    let value = initial;
    const subscribers = new Set<() => void>();
    return {
        getValue: () => value,
        subscribe: update => { subscribers.add(update); return () => subscribers.delete(update); },
        set: next => { value = next; for (const subscriber of subscribers) subscriber(); },
    };
}

/**
 * The recipe {@link TOIMExoDisposable} states, and the reason narrowing the
 * factory is honest rather than merely strict: a `hold` is what mints a
 * derivation, and its `release` is the only thing that gives it back. A factory
 * built out of a `find` could not — a read answers `undefined` for a key with no
 * value and holds nothing.
 */
function makeDeckFactory(world: TExoTestWorld) {
    return (key: TOIMStoreKey): TOIMExoDisposable<readonly TOIMEntitySlot<TCard>[]> => {
        const heldSlot = world.orderService.holdSlotByKey(world.order, key);
        return Object.assign(
            exoBinding(world.db, {
                sourceComputeds: [heldSlot], derive: () => heldSlot.computedValueService.getValueForSlot(heldSlot),
            }),
            { dispose: (): void => { heldSlot.owner.unholdSlot(heldSlot); } },
        );
    };
}

describe('exoFollowKey', () => {
    it('repoints to a different bindable as the key moves', () => {
        const world = build();
        const spades = world.bucketOf(world.rankedService, world.ranked,'spades');
        const hearts = world.bucketOf(world.rankedService, world.ranked,'hearts');
        const one = world.slotOf({ id: 'c1', deckId: 'spades', rank: 1, title: 'one' });
        const two = world.slotOf({ id: 'c2', deckId: 'hearts', rank: 2, title: 'two' });
        world.rankedService.slotContentService.writeBucketMemberSlots(spades, [one]);
        world.rankedService.slotContentService.writeBucketMemberSlots(hearts, [two]);
        world.db.flush();

        const selected = makeLocalBindable<TOIMStoreKey>('spades');
        const followed = exoFollowKey(selected, makeDeckFactory(world));

        expect(followed.getValue().map(slot => slot.entity?.id)).toEqual(['c1']);

        let runCount = 0;
        const off = followed.subscribe(() => { runCount++; });

        selected.set('hearts');
        expect(runCount).toBe(1);
        expect(followed.getValue().map(slot => slot.entity?.id)).toEqual(['c2']);

        const three = world.slotOf({ id: 'c3', deckId: 'hearts', rank: 3, title: 'three' });
        world.rankedService.slotContentService.writeBucketMemberSlots(hearts, [two, three]);
        world.db.flush();
        expect(runCount).toBe(2);
        expect(followed.getValue()).toHaveLength(2);

        // A change to the deck that is no longer selected must not wake it.
        world.rankedService.slotContentService.writeBucketMemberSlots(spades, []);
        world.db.flush();
        expect(runCount).toBe(2);

        off();
    });

    /**
     * The handle the factory mints is released at every repoint and at teardown,
     * so no key transition strands a derivation or its counted hold on its bucket.
     */
    it('gives the previous derivation back when the key moves, and at teardown', () => {
        const world = build();
        const selected = makeLocalBindable<TOIMStoreKey>('d1');
        const followed = exoFollowKey(selected, makeDeckFactory(world));

        const off = followed.subscribe(() => { /* the emit is not what this pins */ });
        expect(world.orderService.getSlotCount(world.order)).toBe(1);

        selected.set('d2');
        // One at a time: the one just left was let go, not merely unsubscribed.
        expect(world.orderService.getSlotCount(world.order)).toBe(1);

        selected.set('d3');
        expect(world.orderService.getSlotCount(world.order)).toBe(1);

        off();
        expect(world.orderService.getSlotCount(world.order)).toBe(0);
    });

    /**
     * An unsubscribed `getValue()` is memoised on the key: one live handle at a
     * time, given back when the key moves off it.
     */
    it('mints one handle per key while unsubscribed, and releases it when the key moves', () => {
        const world = build();
        let mints = 0;
        const factory = makeDeckFactory(world);
        const selected = makeLocalBindable<TOIMStoreKey>('d1');
        const followed = exoFollowKey(selected, (key: TOIMStoreKey) => {
            mints++;
            return factory(key);
        });

        expect(followed.getValue()).toHaveLength(0);
        expect(followed.getValue()).toHaveLength(0);
        expect(followed.getValue()).toHaveLength(0);
        expect(mints).toBe(1);
        expect(world.orderService.getSlotCount(world.order)).toBe(1);

        // Nothing is subscribed, so nothing repoints until the next read.
        selected.set('d2');
        expect(followed.getValue()).toHaveLength(0);
        expect(mints).toBe(2);
        expect(world.orderService.getSlotCount(world.order)).toBe(1);
    });

    /**
     * A throw during the repoint must not leave the NEW key memoised beside the
     * PREVIOUS handle, which the repoint has already disposed.
     */
    it('a factory that refuses a key does not leave its predecessor memoised under that key', () => {
        const world = build();
        const spades = world.bucketOf(world.rankedService, world.ranked,'spades');
        const one = world.slotOf({ id: 'c1', deckId: 'spades', rank: 1, title: 'one' });
        world.rankedService.slotContentService.writeBucketMemberSlots(spades, [one]);
        world.db.flush();

        const factory = makeDeckFactory(world);
        const selected = makeLocalBindable<TOIMStoreKey>('spades');
        const followed = exoFollowKey(selected, (key: TOIMStoreKey) => {
            if (key === 'refused') throw new Error(`no bindable for ${key}`);
            return factory(key);
        });

        expect(followed.getValue().map(slot => slot.entity?.id)).toEqual(['c1']);

        selected.set('refused');
        expect(() => followed.getValue()).toThrow('no bindable for refused');
        expect(() => followed.getValue()).toThrow('no bindable for refused');
        // The memo is empty rather than poisoned, so nothing of the core's is held.
        expect(world.orderService.getSlotCount(world.order)).toBe(0);

        selected.set('spades');
        expect(followed.getValue().map(slot => slot.entity?.id)).toEqual(['c1']);
    });

    /**
     * The subscribe callback resolves a handle and then subscribes to the KEY.
     * The disposer is the only thing that ever calls `disposeBindable()`, and a throw out
     * of that callback means it is never built and never reaches the caller — so
     * the handle just resolved is stranded.
     */
    it('gives the derivation back when the key bindable refuses the subscription', () => {
        const world = build();
        const refusingKey: TOIMExoReadable<TOIMStoreKey> = {
            getValue: () => 'd1',
            subscribe(): () => void { throw new Error('key bindable refused'); },
        };

        let runCount = 0;
        const followed = exoFollowKey(refusingKey, makeDeckFactory(world));
        expect(() => followed.subscribe(() => { runCount++; })).toThrow('key bindable refused');

        expect(world.orderService.getSlotCount(world.order)).toBe(0);
        expect(runCount).toBe(0);
    });
});
