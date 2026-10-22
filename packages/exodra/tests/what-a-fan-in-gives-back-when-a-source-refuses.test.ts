import { exoBinding } from '../src/exoBinding';
import { exoCombine } from '../src/exoCombine';
import type { TOIMExoReadable } from '../src/types/TOIMExoReadable';
import { build } from './support/build';

/**
 * A bare non-OIMDB bindable, standing in for local UI state. `subscriberCount` is what the
 * teardown tests read: a subscription nobody can dispose is invisible from the outside otherwise.
 */
function makeLocalBindable<T>(initial: T): {
    getValue(): T;
    subscribe(update: () => void): () => void;
    set(next: T): void;
    readonly subscriberCount: number;
} {
    let value = initial;
    const subscribers = new Set<() => void>();
    return {
        getValue: () => value,
        subscribe: update => { subscribers.add(update); return () => subscribers.delete(update); },
        set: next => { value = next; for (const subscriber of subscribers) subscriber(); },
        get subscriberCount(): number { return subscribers.size; },
    };
}

describe('exoCombine', () => {
    it('fans in a core-backed bindable and a non-core one — a job no core primitive does alone', () => {
        const world = build();
        const slot = world.slotOf({ id: 'c1', deckId: 'd1', rank: 1, title: 'alpha' });
        world.db.flush();

        const row = exoBinding(world.db, {
            sourceSlots: [slot], derive: () => slot.entity,
        });
        const highlighted = makeLocalBindable(false);

        const combined = exoCombine([row, highlighted], () =>
            `${row.getValue()?.title ?? ''}${highlighted.getValue() ? '*' : ''}`);

        expect(combined.getValue()).toBe('alpha');

        let runCount = 0;
        combined.subscribe(() => { runCount++; });

        highlighted.set(true);
        expect(runCount).toBe(1);
        expect(combined.getValue()).toBe('alpha*');

        world.updateCard('c1', { title: 'beta' });
        world.db.flush();
        expect(runCount).toBe(2);
        expect(combined.getValue()).toBe('beta*');
    });

    /**
     * The defect: the fan-in was `sources.map(...)`, so a source that refused at position k threw
     * out of `map` and took the half-built array of disposers with it. The k subscriptions already
     * taken were then held by nobody — and no disposer reached the caller either, since the
     * subscribe callback never returned. Against an OIMDB source each of those is a permanent entry
     * in the subscriber store, which is a reference: the row or bucket behind it is never reclaimed.
     */
    it('gives back the subscriptions it already took when a later source refuses', () => {
        const healthy = makeLocalBindable(1);
        const refusing: TOIMExoReadable<number> = {
            getValue: () => 2,
            subscribe(): () => void { throw new Error('source refused'); },
        };

        let runCount = 0;
        const combined = exoCombine([healthy, refusing], () => healthy.getValue() + refusing.getValue());
        expect(combined.getValue()).toBe(3);

        expect(() => combined.subscribe(() => { runCount++; })).toThrow('source refused');
        expect(healthy.subscriberCount).toBe(0);
        expect(runCount).toBe(0);

        // Nothing was subscribed, so nothing is woken — and the value still reads through.
        healthy.set(5);
        expect(runCount).toBe(0);
        expect(combined.getValue()).toBe(7);
    });
});
