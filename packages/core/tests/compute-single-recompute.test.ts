import {
    OIMEventQueue,
    OIMComputeRuntime,
    OIMComputed,
    OIMReactiveCollection,
    OIMEffectDependencyKeyedCollection,
    OIMEffectDependencyComputed,
    EOIMComputedEventType,
} from '../src';

/**
 * Locks the compute graph's core guarantee: for ONE source change, every node
 * recomputes EXACTLY ONCE and no intermediate (glitch) value is ever emitted —
 * the topological levels run each node only after all its dependencies.
 */
describe('compute graph: exactly one recompute per node', () => {
    type Row = { id: string; n: number };
    let queue: OIMEventQueue;
    let rt: OIMComputeRuntime;
    let col: OIMReactiveCollection<Row, string>;

    beforeEach(() => {
        queue = new OIMEventQueue(); // manual flush
        rt = new OIMComputeRuntime(queue);
        col = new OIMReactiveCollection<Row, string>(queue, {
            selectPk: r => r.id,
        });
        col.upsertOne({ id: 'a', n: 1 });
        queue.flush();
    });
    afterEach(() => queue.destroy());

    const source = () =>
        new OIMComputed<number>(rt, {
            deps: [new OIMEffectDependencyKeyedCollection(col, 'a')],
            compute: () => col.getOneByPk('a')!.n,
        });

    // Wrap a compute so we can count how many times it actually runs.
    const counted = <T>(fn: () => T) => {
        const box = { count: 0 };
        return {
            box,
            fn: () => {
                box.count++;
                return fn();
            },
        };
    };

    test('linear chain A→B→C→D: one change → each recomputes once', () => {
        const A = source();
        const b = counted(() => A.get() + 1);
        const B = new OIMComputed(rt, {
            deps: [new OIMEffectDependencyComputed(A)],
            compute: b.fn,
        });
        const c = counted(() => B.get() + 1);
        const C = new OIMComputed(rt, {
            deps: [new OIMEffectDependencyComputed(B)],
            compute: c.fn,
        });
        const d = counted(() => C.get() + 1);
        const D = new OIMComputed(rt, {
            deps: [new OIMEffectDependencyComputed(C)],
            compute: d.fn,
        });
        D.get();
        b.box.count = c.box.count = d.box.count = 0;

        col.upsertOne({ id: 'a', n: 5 });
        queue.flush();

        expect(D.get()).toBe(8); // 5→6→7→8
        expect(b.box.count).toBe(1);
        expect(c.box.count).toBe(1);
        expect(d.box.count).toBe(1);
    });

    test('diamond D=(B,C), B,C=f(A): one change → each recomputes once', () => {
        const A = source();
        const B = new OIMComputed(rt, {
            deps: [new OIMEffectDependencyComputed(A)],
            compute: () => A.get() + 1,
        });
        const C = new OIMComputed(rt, {
            deps: [new OIMEffectDependencyComputed(A)],
            compute: () => A.get() + 2,
        });
        const d = counted(() => B.get() + C.get());
        const D = new OIMComputed(rt, {
            deps: [
                new OIMEffectDependencyComputed(B),
                new OIMEffectDependencyComputed(C),
            ],
            compute: d.fn,
        });
        D.get();
        d.box.count = 0;

        col.upsertOne({ id: 'a', n: 5 });
        queue.flush();

        expect(D.get()).toBe(5 + 1 + (5 + 2)); // 13
        expect(d.box.count).toBe(1);
    });

    test('deep-uneven E=(A, deep D): one recompute, NO glitch value emitted', () => {
        // A→B→C→D chain, and E depends on shallow A AND deep D. This is the case
        // that glitches without topological levels (E would read a stale D).
        const A = source();
        const B = new OIMComputed(rt, {
            deps: [new OIMEffectDependencyComputed(A)],
            compute: () => A.get() + 1,
        });
        const C = new OIMComputed(rt, {
            deps: [new OIMEffectDependencyComputed(B)],
            compute: () => B.get() + 1,
        });
        const D = new OIMComputed(rt, {
            deps: [new OIMEffectDependencyComputed(C)],
            compute: () => C.get() + 1,
        });
        const e = counted(() => A.get() * 100 + D.get());
        const E = new OIMComputed(rt, {
            deps: [
                new OIMEffectDependencyComputed(A),
                new OIMEffectDependencyComputed(D),
            ],
            compute: e.fn,
        });

        // Levels must be topological depth — owned by the runtime, queried via it.
        expect([
            rt.getLevel(A),
            rt.getLevel(B),
            rt.getLevel(C),
            rt.getLevel(D),
            rt.getLevel(E),
        ]).toEqual([0, 1, 2, 3, 4]);

        const emitted: number[] = [];
        E.emitter.on(EOIMComputedEventType.UPDATE, () =>
            emitted.push(E.get())
        );

        E.get(); // prime
        e.box.count = 0;
        emitted.length = 0; // drop the priming emit — measure only the change

        col.upsertOne({ id: 'a', n: 5 });
        queue.flush();

        // 5*100 + (5→6→7→8) = 508. Exactly one recompute, and the ONLY value
        // ever emitted is the correct final one (no stale-D intermediate).
        expect(E.get()).toBe(508);
        expect(e.box.count).toBe(1);
        expect(emitted).toEqual([508]);
    });
});
