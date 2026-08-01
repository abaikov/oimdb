import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { createOIMCollectionKit } from '../src/dx/OIMCollectionKit';

type TRow = { id: string; value: number; other: number };

/**
 * A frame is one indivisible reporting cycle: the queue drains its tasks, then
 * effects run. Writing anywhere inside it is refused.
 *
 * Refusing during the task drain was always the rule. Extending it to the effect
 * phase buys two things. A write from an effect used to land in the NEXT frame,
 * which made an effect that touches its own dependency tick forever, once per
 * frame, with nothing to stop it — now it is a loud error the first time. And
 * because nothing can mutate mid-frame any more, carriers keep their change
 * records until the frame ends, so an effect can look at a dependency and see
 * WHAT changed rather than only that something did.
 *
 * These tests pin the invariant so it cannot be quietly relaxed.
 */
describe('writes during the effect phase', () => {
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

    it('throws when an effect writes to another entity', () => {
        const { queue, kit } = build();
        kit.effect([kit.on.collection(kit.collection, 'a')], () => {
            kit.collection.upsertOneByPk('b', { value: 1 });
        });
        queue.flush();

        kit.collection.upsertOneByPk('a', { value: 1 });
        expect(() => queue.flush()).toThrow(/during queue\.flush/i);
    });

    it('throws when an effect writes to its own dependency', () => {
        // The self-sustaining loop: before the invariant, this scheduled itself
        // into every following frame and ran forever.
        const { queue, kit } = build();
        kit.effect([kit.on.collection(kit.collection, 'a')], () => {
            kit.collection.upsertOneByPk('a', { value: 2 });
        });
        queue.flush();

        kit.collection.upsertOneByPk('a', { value: 1 });
        expect(() => queue.flush()).toThrow(/during queue\.flush/i);
    });

    it('throws when a plain subscriber writes during the task drain', () => {
        // The original half of the rule, kept green so extending it did not
        // weaken it.
        const { queue, kit } = build();
        kit.collection.emitter.subscribeOnKey('a', () => {
            kit.collection.upsertOneByPk('b', { value: 1 });
        });
        kit.collection.upsertOneByPk('a', { value: 1 });
        expect(() => queue.flush()).toThrow(/during queue\.flush/i);
    });

    it('reports the queue as in-flush for the whole frame, effects included', () => {
        const { queue, kit } = build();
        let duringTask: boolean | undefined;
        let duringEffect: boolean | undefined;

        kit.collection.emitter.subscribeOnKey('a', () => {
            duringTask = queue.isInFlush;
        });
        kit.effect([kit.on.collection(kit.collection, 'a')], () => {
            duringEffect = queue.isInFlush;
        });
        queue.flush();

        kit.collection.upsertOneByPk('a', { value: 1 });
        queue.flush();

        expect(duringTask).toBe(true);
        expect(duringEffect).toBe(true);
        // …and open again once the frame is over.
        expect(queue.isInFlush).toBe(false);
    });

    it('still lets a computed publish its value during the effect phase', () => {
        // A computed writes its own value while effects run; that must keep
        // working, or every derived chain would break. It goes through an
        // immediate-mode emitter, which is not a collection write.
        const { queue, kit } = build();
        const doubled = kit.computed(
            [kit.on.collection(kit.collection, 'a')],
            () => (kit.collection.getOneByPk('a')?.value ?? 0) * 2
        );
        const chained = kit.computed(
            [kit.on.computed(doubled)],
            () => doubled.get() + 1
        );
        let seen = 0;
        kit.effect([kit.on.computed(chained)], () => {
            seen = chained.get();
        });
        queue.flush();

        kit.collection.upsertOneByPk('a', { value: 5 });
        expect(() => queue.flush()).not.toThrow();
        expect(seen).toBe(11);
    });

    it('accepts writes again on the next frame', () => {
        const { queue, kit } = build();
        let runs = 0;
        kit.effect([kit.on.collection(kit.collection, 'a')], () => {
            runs++;
        });
        queue.flush();
        runs = 0;

        kit.collection.upsertOneByPk('a', { value: 1 });
        queue.flush();
        // Writing from OUTSIDE the frame is normal and always was.
        expect(() => kit.collection.upsertOneByPk('b', { value: 9 })).not.toThrow();
        queue.flush();

        expect(runs).toBe(1);
        expect(kit.collection.getOneByPk('b')?.value).toBe(9);
    });
});
