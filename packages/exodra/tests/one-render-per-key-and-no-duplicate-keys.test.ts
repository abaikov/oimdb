import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMStoreKey } from '@oimdb/core';
import { exoBinding } from '../src/exoBinding';
import { exoSource } from '../src/exoSource';
import { exoRows } from '../src/exoRows';
import { build } from './support/build';
import type { TExoTestWorld } from './support/build';

/**
 * A keys bindable whose upstream is a bare set of handlers, plus the two things the test drives it
 * with: the value, and the notification. `notify()` is what the source's own writer would call —
 * a flush, an event — and it is deliberately NOT hidden behind `set`, because when a row list is
 * subscribed the refusal for a duplicate key comes back out of THAT call.
 */
function makeKeys(initial: readonly string[]): {
    bindable: TExoBindable<readonly string[]>;
    set(next: readonly string[]): void;
    notify(): void;
    readonly upstreamCount: number;
} {
    let keys = initial;
    const subscribers = new Set<() => void>();
    return {
        bindable: exoSource<readonly string[]>(
            () => keys,
            onChange => { subscribers.add(onChange); return () => subscribers.delete(onChange); },
        ),
        set(next: readonly string[]): void { keys = next; },
        notify(): void { for (const subscriber of subscribers) subscriber(); },
        get upstreamCount(): number { return subscribers.size; },
    };
}

/** A row that holds one of the core's derivations, and says how to give it back. */
function renderDeckRow(world: TExoTestWorld) {
    return (deckId: TOIMStoreKey) => {
        const heldSlot = world.orderService.holdSlotByKey(world.order, deckId);
        const cards = exoBinding(world.db, {
            sourceComputeds: [heldSlot], derive: () => heldSlot.computedValueService.getValueForSlot(heldSlot),
        });
        return { schema: { deckId, cards }, dispose: () => { heldSlot.owner.unholdSlot(heldSlot); } };
    };
}

describe('exoRows', () => {
    /**
     * `exoSource` is lazy, so the test calls `subscribe` to run the keys bindable's upstream callback.
     *
     * Two facts hold with it wired up: an emit lands only on a REAL change (a new array with the same keys
     * is silent), and the duplicate-key refusal of a SUBSCRIBED list arrives out of the upstream
     * notification, not out of the reader's `getValue()`.
     */
    it('renders each key once, keeps schema identity across unrelated changes, and rejects duplicates', () => {
        const keys = makeKeys(['a', 'b']);

        let renders = 0;
        const rows = exoRows(keys.bindable, (key: string) => {
            renders++;
            // A row that holds nothing still says so, at the one place that
            // knows. See `TOIMExoRenderedRow` for why that is not optional.
            return { schema: { key }, dispose: () => { /* nothing was resolved */ } };
        });

        const first = rows.getValue();
        expect(first.map(row => row.key)).toEqual(['a', 'b']);
        expect(renders).toBe(2);

        // Unchanged source -> same array reference, no re-render.
        expect(rows.getValue()).toBe(first);
        expect(renders).toBe(2);

        let emits = 0;
        const off = rows.subscribe(() => { emits++; });
        // Lazy and ref-counted: the upstream is subscribed BECAUSE somebody is listening, which is
        // the whole reason the loop below reached anybody at all.
        expect(keys.upstreamCount).toBe(1);

        keys.set(['b', 'c']);
        keys.notify();
        expect(emits).toBe(1);
        const second = rows.getValue();
        expect(second.map(row => row.key)).toEqual(['b', 'c']);
        expect(renders).toBe(3); // only 'c' is new; 'b' schema reused
        expect(second[0]).toBe(first[1]); // 'b' schema object identity preserved

        // A notification that is not a change: same keys, new array. The read is idempotent, so the
        // rebuilt output is the same reference and nothing is emitted.
        keys.set(['b', 'c']);
        keys.notify();
        expect(rows.getValue()).toBe(second);
        expect(renders).toBe(3);
        expect(emits).toBe(1);

        // Keys must be unique. SUBSCRIBED, the refusal comes back out of the notification — the
        // handler reads before it decides whether to emit — so it lands on whoever notified, which
        // for a core-backed keys bindable is the flush. Nothing is emitted for it.
        keys.set(['x', 'x']);
        expect(() => keys.notify()).toThrow(/duplicate key/);
        expect(emits).toBe(1);
        // And the reader gets the same refusal rather than a silently stale list.
        expect(() => rows.getValue()).toThrow(/duplicate key/);

        off();
        expect(keys.upstreamCount).toBe(0);
    });

    /**
     * The duplicate-key refusal is documented and deliberate. Thrown from the FIRST read inside the
     * subscribe callback, it must not leave `exoSource` priming or its entry in the subscriber list,
     * or the list goes deaf and no change is ever delivered again.
     */
    it('a duplicate key refused while priming does not leave the list deaf', () => {
        const keys = makeKeys(['x', 'x']);
        const rows = exoRows(keys.bindable, (key: string) => ({
            schema: { key }, dispose: () => { /* nothing was resolved */ },
        }));

        let emits = 0;
        const listen = (): void => { emits++; };
        expect(() => rows.subscribe(listen)).toThrow(/duplicate key/);
        expect(keys.upstreamCount).toBe(0);

        keys.set(['a', 'b']);
        const off = rows.subscribe(listen);
        expect(keys.upstreamCount).toBe(1);

        keys.set(['a', 'b', 'c']);
        keys.notify();
        expect(emits).toBe(1);
        expect(rows.getValue().map(row => row.key)).toEqual(['a', 'b', 'c']);

        off();
    });

    /**
     * A schema whose rows hold something of the core's — the shape `what-a-key-that-moves-releases.test.ts` pins for
     * `exoFollowKey`, applied here. A derivation resolved inside a row is a counted hold on it and,
     * through it, on the bucket it reads; until `render` was narrowed to hand back a
     * `TOIMExoRenderedRow` the only reference to that went into the cache.
     */
    it('gives a departed row back on the sweep, and every live row back at teardown', () => {
        const world = build();
        const keys = makeKeys(['d1', 'd2']);
        const rows = exoRows(keys.bindable, renderDeckRow(world));

        let emits = 0;
        const off = rows.subscribe(() => { emits++; });
        expect(world.orderService.getSlotCount(world.order)).toBe(2);

        // 'd2' scrolls out of the list. One derivation per key ever shown is
        // exactly the leak: a list the user scrolls keeps everything it ever
        // rendered.
        keys.set(['d1']);
        keys.notify();
        expect(emits).toBe(1);
        expect(world.orderService.getSlotCount(world.order)).toBe(1);

        off();
        expect(world.orderService.getSlotCount(world.order)).toBe(0);
    });

    /**
     * The third path, and the one that outlived the other two: the duplicate-key refusal used to
     * happen part-way through the render loop — AFTER earlier keys had been written into the cache
     * and BEFORE the sweep — while `lastKeys` kept the PREVIOUS sequence. A return to that sequence
     * then took the identity short-circuit, which returns before the sweep, so those half-written
     * rows were never swept and their holds stood for the life of the process.
     *
     * Uniqueness is decided over the whole sequence before anything is rendered now, so a refused
     * read has rendered nothing and moved nothing.
     */
    it('a refused key sequence renders nothing and strands nothing', () => {
        const world = build();
        const keys = makeKeys(['d1']);
        const rows = exoRows(keys.bindable, renderDeckRow(world));

        const off = rows.subscribe(() => { /* the emit is not what this pins */ });
        expect(world.orderService.getSlotCount(world.order)).toBe(1);

        keys.set(['d2', 'x', 'x']);
        expect(() => keys.notify()).toThrow(/duplicate key/);
        expect(world.orderService.getSlotCount(world.order)).toBe(1);

        // And the list is not poisoned: `lastKeys` still describes what the cache holds, so the
        // accepted sequence reads back exactly as it did.
        keys.set(['d1']);
        expect(rows.getValue().map(row => row.deckId)).toEqual(['d1']);
        expect(world.orderService.getSlotCount(world.order)).toBe(1);

        off();
        expect(world.orderService.getSlotCount(world.order)).toBe(0);
    });
});
