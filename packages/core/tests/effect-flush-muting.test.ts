import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { createOIMCollectionKit } from '../src/dx/OIMCollectionKit';

type TRow = { id: string; value: number; other: number };

/**
 * An effect ignores further source notifications once it has reported one, until the start of the
 * next runtime flush. That muting used to be implemented by unsubscribing from every source
 * dependency and resubscribing afterwards; it is now a flag. These tests pin the behaviour the
 * mechanism has to preserve, so the two implementations are indistinguishable from outside.
 */
describe('effect muting across a flush cycle', () => {
    const build = () => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TRow, string>(queue, {
            selectPk: r => r.id,
        });
        kit.collection.upsertMany([
            { id: 'a', value: 0, other: 0 },
            { id: 'b', value: 0, other: 0 },
        ]);
        queue.flush();
        return { queue, kit };
    };

    it('reports one update per flush however many writes land in it', () => {
        const { queue, kit } = build();
        let updates = 0;
        let runs = 0;
        kit.effect([kit.on.collection(kit.collection, 'a')], () => runs++, {
            onUpdate: () => updates++,
        });
        queue.flush();
        updates = 0;
        runs = 0;

        for (let i = 1; i <= 5; i++) {
            kit.collection.upsertOneByPk('a', { value: i });
        }
        queue.flush();

        expect(updates).toBe(1);
        expect(runs).toBe(1);
    });

    it('reports again on the next flush', () => {
        const { queue, kit } = build();
        let updates = 0;
        let runs = 0;
        kit.effect([kit.on.collection(kit.collection, 'a')], () => runs++, {
            onUpdate: () => updates++,
        });
        queue.flush();
        updates = 0;
        runs = 0;

        for (let cycle = 1; cycle <= 3; cycle++) {
            kit.collection.upsertOneByPk('a', { value: cycle });
            queue.flush();
        }

        expect(updates).toBe(3);
        expect(runs).toBe(3);
    });

    it('folds several distinct source dependencies into one report', () => {
        const { queue, kit } = build();
        let updates = 0;
        let runs = 0;
        kit.effect(
            [
                kit.on.collection(kit.collection, 'a'),
                kit.on.collection(kit.collection, 'b'),
            ],
            () => runs++,
            { onUpdate: () => updates++ }
        );
        queue.flush();
        updates = 0;
        runs = 0;

        kit.collection.upsertOneByPk('a', { value: 1 });
        kit.collection.upsertOneByPk('b', { value: 1 });
        queue.flush();

        expect(updates).toBe(1);
        expect(runs).toBe(1);
    });

    it('refuses a write the effect makes from inside its own run', () => {
        // A frame is indivisible: the effect phase is inside it, so writing there
        // is refused exactly as it is from a subscriber. Before that rule the
        // write was deferred to the next frame, which turned an effect touching
        // its own dependency into a loop that ran once per frame forever. See
        // `effect-phase-writes.test.ts` for the invariant itself.
        const { queue, kit } = build();
        let runs = 0;
        kit.effect([kit.on.collection(kit.collection, 'a')], () => {
            runs++;
            kit.collection.upsertOneByPk('a', { value: runs });
        });
        queue.flush();
        runs = 0;

        kit.collection.upsertOneByPk('a', { value: 100 });
        expect(() => queue.flush()).toThrow(/during queue\.flush/i);
    });

    it('still reports after a cycle in which it was muted but never ran', () => {
        // Destroying the scheduled run must not leave the effect permanently muted.
        const { queue, kit } = build();
        let updates = 0;
        const effect = kit.effect(
            [kit.on.collection(kit.collection, 'a')],
            () => undefined,
            { onUpdate: () => updates++ }
        );
        queue.flush();
        updates = 0;

        kit.collection.upsertOneByPk('a', { value: 1 });
        queue.flush();
        expect(updates).toBe(1);

        effect.destroy();
        kit.collection.upsertOneByPk('a', { value: 2 });
        queue.flush();
        // Destroyed effects report nothing at all.
        expect(updates).toBe(1);
    });

    it('keeps unrelated keys from waking the effect', () => {
        const { queue, kit } = build();
        let runs = 0;
        kit.effect([kit.on.collection(kit.collection, 'a')], () => runs++);
        queue.flush();
        runs = 0;

        kit.collection.upsertOneByPk('b', { value: 7 });
        queue.flush();

        expect(runs).toBe(0);
    });

    it('does not allocate a fresh subscription per invalidation', () => {
        // The point of the flag: the dependency stays subscribed across cycles, so
        // repeated writes never touch the emitter's subscriber set.
        const { queue, kit } = build();
        // `emitter` is protected; the test reaches it deliberately because
        // the property under test is "no subscriber churn", which is invisible
        // from the public surface.
        const emitter = (
            kit.collection as unknown as {
                emitter: {
                    subscribeOnKey: (k: string, h: () => void) => () => void;
                };
            }
        ).emitter;
        const original = emitter.subscribeOnKey.bind(emitter);
        let subscriptions = 0;
        emitter.subscribeOnKey = (k: string, h: () => void) => {
            subscriptions++;
            return original(k, h);
        };

        kit.effect([kit.on.collection(kit.collection, 'a')], () => undefined);
        queue.flush();
        const afterSetup = subscriptions;

        for (let i = 0; i < 20; i++) {
            kit.collection.upsertOneByPk('a', { value: i });
            queue.flush();
        }

        expect(subscriptions - afterSetup).toBe(0);
    });
});
