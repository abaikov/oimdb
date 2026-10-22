import {
    OIMEventQueue,
    OIMComputeRuntime,
    OIMComputed,
    OIMReactiveCollection,
    OIMEffectDependencyKeyedCollection,
    getOIMComputeRuntime,
    peekOIMComputeRuntime,
    setOIMComputeRuntime,
} from '../src';

type Row = { id: string; n: number };

const makeCollection = (queue: OIMEventQueue) =>
    new OIMReactiveCollection<Row, string>(queue, { selectPk: r => r.id });

describe('compute runtime: registry', () => {
    it('hands out one runtime per queue, and a different one per queue', () => {
        const queue = new OIMEventQueue();
        const otherQueue = new OIMEventQueue();

        const runtime = getOIMComputeRuntime(queue);

        expect(getOIMComputeRuntime(queue)).toBe(runtime);
        expect(getOIMComputeRuntime(otherQueue)).not.toBe(runtime);
        expect(runtime.queue).toBe(queue);
    });

    it('peek does not create, and reports the runtime once it exists', () => {
        const queue = new OIMEventQueue();

        expect(peekOIMComputeRuntime(queue)).toBeUndefined();
        // Still nothing — peeking must not have attached anything.
        expect(peekOIMComputeRuntime(queue)).toBeUndefined();

        const runtime = getOIMComputeRuntime(queue);
        expect(peekOIMComputeRuntime(queue)).toBe(runtime);
    });

    it('installs a custom runtime and rejects one bound to another queue', () => {
        const queue = new OIMEventQueue();
        const otherQueue = new OIMEventQueue();

        const custom = new OIMComputeRuntime(queue);
        setOIMComputeRuntime(queue, custom);

        expect(getOIMComputeRuntime(queue)).toBe(custom);
        expect(peekOIMComputeRuntime(queue)).toBe(custom);

        expect(() =>
            setOIMComputeRuntime(queue, new OIMComputeRuntime(otherQueue))
        ).toThrow(/attached to a different queue/);
    });

    it('an instrumented subclass installed up front sees every scheduled node', () => {
        const queue = new OIMEventQueue();
        const levels: number[] = [];

        class RecordingRuntime extends OIMComputeRuntime {
            public override schedule(task: () => void, level = 0): () => void {
                levels.push(level);
                return super.schedule(task, level);
            }
        }

        setOIMComputeRuntime(queue, new RecordingRuntime(queue));

        const collection = makeCollection(queue);
        collection.upsertOne({ id: 'a', n: 1 });
        queue.flush();

        const runtime = getOIMComputeRuntime(queue);
        const doubled = new OIMComputed<number>(runtime, {
            compute: () => (collection.getOneByPk('a')?.n ?? 0) * 2,
            deps: [
                new OIMEffectDependencyKeyedCollection(collection, 'a'),
            ],
        });

        collection.upsertOne({ id: 'a', n: 5 });
        queue.flush();

        expect(doubled.get()).toBe(10);
        expect(levels.length).toBeGreaterThan(0);
    });
});

describe('compute runtime: destroy', () => {
    it('detaches from the queue so it no longer drains', () => {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputeRuntime(queue);

        let runCount = 0;
        runtime.schedule(() => runCount++);
        queue.flush();
        expect(runCount).toBe(1);

        runtime.destroy();
        expect(runtime.isDestroyed).toBe(true);

        runtime.schedule(() => runCount++);
        queue.flush();
        // Detached: the AFTER_FLUSH subscription is gone, so nothing drains.
        expect(runCount).toBe(1);
    });

    it('is idempotent', () => {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputeRuntime(queue);

        runtime.destroy();
        expect(() => runtime.destroy()).not.toThrow();
        expect(runtime.isDestroyed).toBe(true);
    });

    it('drops pending work instead of leaving it to run later', () => {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputeRuntime(queue);

        let runCount = 0;
        runtime.schedule(() => runCount++);
        runtime.scheduleAfterFlush(() => runCount++);
        runtime.destroy();

        queue.flush();
        expect(runCount).toBe(0);
    });

    it('a destroyed runtime is replaced, not handed back', () => {
        const queue = new OIMEventQueue();
        const runtime = getOIMComputeRuntime(queue);

        runtime.destroy();

        expect(peekOIMComputeRuntime(queue)).toBeUndefined();
        const nextRuntime = getOIMComputeRuntime(queue);
        expect(nextRuntime).not.toBe(runtime);
        expect(nextRuntime.isDestroyed).toBe(false);
        expect(peekOIMComputeRuntime(queue)).toBe(nextRuntime);
    });

    it('the replacement runtime drives computeds normally', () => {
        const queue = new OIMEventQueue();
        getOIMComputeRuntime(queue).destroy();

        const collection = makeCollection(queue);
        collection.upsertOne({ id: 'a', n: 2 });
        queue.flush();

        const runtime = getOIMComputeRuntime(queue);
        const doubled = new OIMComputed<number>(runtime, {
            compute: () => (collection.getOneByPk('a')?.n ?? 0) * 2,
            deps: [
                new OIMEffectDependencyKeyedCollection(collection, 'a'),
            ],
        });

        expect(doubled.get()).toBe(4);

        collection.upsertOne({ id: 'a', n: 7 });
        queue.flush();
        expect(doubled.get()).toBe(14);
    });
});
