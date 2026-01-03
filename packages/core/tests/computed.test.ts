import {
    OIMEventQueue,
    OIMReactiveCollection,
    OIMReactiveIndexManualSetBased,
    OIMReactiveObject,
    OIMComputed,
    OIMEffectDependencyComputed,
    OIMEffectDependencyKeyedCollection,
    OIMEffectDependencyKeyedIndex,
    OIMEffectDependencyKeyedObject,
} from '../src';

describe('OIMComputed', () => {
    test('recomputes on dependency updates via the same queue and notifies subscribers', () => {
        type TKey = 'a';
        const queue = new OIMEventQueue();
        const obj = new OIMReactiveObject<TKey, number>(queue);

        const computed = new OIMComputed<number>(queue, {
            compute: () => (obj.get('a') ?? 0) * 2,
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
        });

        let calls = 0;
        computed.updateEventEmitter.subscribeOnKey('value', () => {
            calls++;
        });

        obj.setProperty('a', 2);

        // Flush 1: upstream subscriptions invalidate/recompute computed in pre-phase
        queue.flush();
        // Flush 2: computed subscribers are delivered via the main queue snapshot
        queue.flush();

        expect(computed.get()).toBe(4);
        expect(calls).toBe(1);

        computed.destroy();
        obj.destroy();
        queue.destroy();
    });

    test('can depend on object key + collection pk + index key and compute from all of them', () => {
        const queue = new OIMEventQueue();

        type TObjectKey = 'a';
        const obj = new OIMReactiveObject<TObjectKey, number>(queue);

        type TEntity = { id: number; x: number };
        const collection = new OIMReactiveCollection<TEntity, number>(queue);

        type TIndexKey = 'g';
        const index = new OIMReactiveIndexManualSetBased<TIndexKey, number>(
            queue
        );

        const computed = new OIMComputed<number>(queue, {
            compute: () => {
                const a = obj.get('a') ?? 0;
                const x = collection.getOneByPk(1)?.x ?? 0;
                const bucketSize = index.getKeySize('g');
                return a + x + bucketSize;
            },
            deps: [
                new OIMEffectDependencyKeyedObject(obj, 'a'),
                new OIMEffectDependencyKeyedCollection(collection, 1),
                new OIMEffectDependencyKeyedIndex(index, 'g'),
            ],
        });

        let calls = 0;
        computed.updateEventEmitter.subscribeOnKey('value', () => {
            calls++;
        });

        obj.setProperty('a', 1);
        collection.upsertOneByPk(1, { id: 1, x: 10 });
        index.setPks('g', [1, 2]);

        // Flush 1: upstream subscriptions invalidate/recompute computed in pre-phase
        queue.flush();
        // Flush 2: computed subscribers are delivered via the main queue snapshot
        queue.flush();

        expect(computed.get()).toBe(13); // 1 + 10 + 2
        expect(calls).toBe(1);

        computed.destroy();
        index.destroy();
        collection.destroy();
        obj.destroy();
        queue.destroy();
    });

    test('supports many computed with computed-to-computed dependencies (chain + diamond)', () => {
        type TObjectKey = 'a' | 'b';
        const queue = new OIMEventQueue();
        const obj = new OIMReactiveObject<TObjectKey, number>(queue);

        const calls = {
            a: 0,
            b: 0,
            c: 0,
            d: 0,
            e: 0,
        };

        const A = new OIMComputed<number>(queue, {
            compute: () => {
                calls.a++;
                return (obj.get('a') ?? 0) * 2;
            },
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
        });

        const B = new OIMComputed<number>(queue, {
            compute: () => {
                calls.b++;
                return A.get() + (obj.get('b') ?? 0);
            },
            deps: [
                new OIMEffectDependencyComputed({
                    emitter: A.emitter,
                    updateEventEmitter: A.updateEventEmitter,
                }),
                new OIMEffectDependencyKeyedObject(obj, 'b'),
            ],
        });

        const C = new OIMComputed<number>(queue, {
            compute: () => {
                calls.c++;
                return B.get() * 3;
            },
            deps: [
                new OIMEffectDependencyComputed({
                    emitter: B.emitter,
                    updateEventEmitter: B.updateEventEmitter,
                }),
            ],
        });

        const D = new OIMComputed<number>(queue, {
            compute: () => {
                calls.d++;
                return A.get() + C.get();
            },
            deps: [
                new OIMEffectDependencyComputed({
                    emitter: A.emitter,
                    updateEventEmitter: A.updateEventEmitter,
                }),
                new OIMEffectDependencyComputed({
                    emitter: C.emitter,
                    updateEventEmitter: C.updateEventEmitter,
                }),
            ],
        });

        const E = new OIMComputed<number>(queue, {
            compute: () => {
                calls.e++;
                return D.get() + B.get();
            },
            deps: [
                new OIMEffectDependencyComputed({
                    emitter: D.emitter,
                    updateEventEmitter: D.updateEventEmitter,
                }),
                new OIMEffectDependencyComputed({
                    emitter: B.emitter,
                    updateEventEmitter: B.updateEventEmitter,
                }),
            ],
        });

        obj.merge({ a: 1, b: 2 });
        queue.flush();

        expect(A.get()).toBe(2);
        expect(B.get()).toBe(4);
        expect(C.get()).toBe(12);
        expect(D.get()).toBe(14);
        expect(E.get()).toBe(18);

        const afterFirst = { ...calls };
        expect(afterFirst.a).toBeGreaterThan(0);
        expect(afterFirst.b).toBeGreaterThan(0);
        expect(afterFirst.c).toBeGreaterThan(0);
        expect(afterFirst.d).toBeGreaterThan(0);
        expect(afterFirst.e).toBeGreaterThan(0);

        obj.setProperty('a', 2);
        queue.flush();

        expect(A.get()).toBe(4);
        expect(B.get()).toBe(6);
        expect(C.get()).toBe(18);
        expect(D.get()).toBe(22);
        expect(E.get()).toBe(28);

        expect(calls.a).toBeGreaterThan(afterFirst.a);
        expect(calls.b).toBeGreaterThan(afterFirst.b);
        expect(calls.c).toBeGreaterThan(afterFirst.c);
        expect(calls.d).toBeGreaterThan(afterFirst.d);
        expect(calls.e).toBeGreaterThan(afterFirst.e);

        E.destroy();
        D.destroy();
        C.destroy();
        B.destroy();
        A.destroy();
        obj.destroy();
        queue.destroy();
    });
});
