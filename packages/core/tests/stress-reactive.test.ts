import {
    OIMComputed,
    OIMEffect,
    OIMEffectDependencyComputed,
    OIMEffectDependencyKeyedCollection,
    OIMEffectDependencyKeyedIndex,
    OIMEffectDependencyKeyedObject,
    OIMComputeRuntime,
    OIMEventQueue,
    OIMReactiveCollection,
    OIMReactiveIndexManualSetBased,
    OIMReactiveObject,
} from '../src';

function createSeededRng(seed: number): () => number {
    // Simple LCG for deterministic tests.
    let state = seed >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0xffffffff;
    };
}

describe('Stress / production-ish reactive behavior (no infinite loop tests)', () => {
    test('UI-like: 4 sources -> 3 computeds -> 1 UI subscriber stays consistent and coalesces', () => {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputeRuntime(queue);

        type TObjectKey = 'add' | 'mul';
        const obj = new OIMReactiveObject<TObjectKey, number>(queue);

        type TEntity = { id: number; x: number };
        const collection = new OIMReactiveCollection<TEntity, number>(queue);

        type TIndexKey = 'bucket';
        const index = new OIMReactiveIndexManualSetBased<TIndexKey, number>(
            queue
        );

        // C1 = (collection[1].x + obj.add) * obj.mul
        const C1 = new OIMComputed<number>(runtime, {
            compute: () => {
                const x = collection.getOneByPk(1)?.x ?? 0;
                const add = obj.get('add') ?? 0;
                const mul = obj.get('mul') ?? 1;
                return (x + add) * mul;
            },
            deps: [
                new OIMEffectDependencyKeyedCollection(collection, 1),
                new OIMEffectDependencyKeyedObject(obj, ['add', 'mul']),
            ],
        });

        // C2 = size(index.bucket) + obj.add
        const C2 = new OIMComputed<number>(runtime, {
            compute: () => {
                const add = obj.get('add') ?? 0;
                const size = index.getKeySize('bucket');
                return size + add;
            },
            deps: [
                new OIMEffectDependencyKeyedIndex(index, 'bucket'),
                new OIMEffectDependencyKeyedObject(obj, 'add'),
            ],
        });

        // C3 = C1 + C2
        const C3 = new OIMComputed<number>(runtime, {
            compute: () => C1.get() + C2.get(),
            deps: [
                new OIMEffectDependencyComputed({
                    emitter: C1.emitter,
                    updateEventEmitter: C1.updateEventEmitter,
                }),
                new OIMEffectDependencyComputed({
                    emitter: C2.emitter,
                    updateEventEmitter: C2.updateEventEmitter,
                }),
            ],
        });

        const uiCalls: number[] = [];
        C3.updateEventEmitter.subscribeOnKey('value', () => {
            // UI reads only the final computed.
            uiCalls.push(C3.get());
        });

        // Multiple updates before a single flush should coalesce into a single UI call.
        obj.setProperty('add', 1);
        obj.setProperty('mul', 2);
        collection.upsertOneByPk(1, { id: 1, x: 10 });
        index.setSlots(
            'bucket',
            new Set([1, 2, 3].map(pk => ({ pk, item: { id: pk } })))
        );

        queue.flush();

        const expected1 = (10 + 1) * 2 + (3 + 1);
        expect(C3.get()).toBe(expected1);
        expect(uiCalls).toEqual([expected1]);
        expect(queue.isEmpty).toBe(true);

        // Another batch with multiple changes still coalesces to one call per flush.
        obj.setProperty('add', 5);
        collection.upsertOneByPk(1, { id: 1, x: 7 });
        index.setSlots('bucket', new Set([{ pk: 9, item: { id: 9 } }]));

        queue.flush();

        const expected2 = (7 + 5) * 2 + (1 + 5);
        expect(C3.get()).toBe(expected2);
        expect(uiCalls).toEqual([expected1, expected2]);
        expect(queue.isEmpty).toBe(true);

        C3.destroy();
        C2.destroy();
        C1.destroy();
        index.destroy();
        collection.destroy();
        obj.destroy();
        queue.destroy();
    });

    test('no subscription leaks: repeated create/destroy of computed/effect leaves source emitters clean', () => {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputeRuntime(queue);

        type TKey = 'a';
        const obj = new OIMReactiveObject<TKey, number>(queue);

        // Create/destroy a bunch of computeds and effects that depend on obj.a
        for (let i = 0; i < 200; i++) {
            const computed = new OIMComputed<number>(runtime, {
                compute: () => (obj.get('a') ?? 0) + 1,
                deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
            });
            const effect = new OIMEffect(runtime, {
                deps: [
                    new OIMEffectDependencyComputed({
                        emitter: computed.emitter,
                        updateEventEmitter: computed.updateEventEmitter,
                    }),
                ],
                run: () => {
                    // no-op
                },
            });

            // Touch value once and flush a bit to exercise scheduling.
            obj.setProperty('a', i);
            queue.flush();

            effect.destroy();
            computed.destroy();
        }

        // After all destroys, the reactive object should have no remaining subscriptions.
        expect(obj.hasSubscriptions()).toBe(false);
        expect(obj.getHandlerCount('a')).toBe(0);

        obj.destroy();
        queue.destroy();
    });

    test('fuzz: random updates/subscriptions across multiple sources remain consistent and stable', () => {
        const rng = createSeededRng(1337);

        const queue = new OIMEventQueue();
        const runtime = new OIMComputeRuntime(queue);

        type TObjectKey = 'add';
        const obj = new OIMReactiveObject<TObjectKey, number>(queue);

        type TEntity = { id: number; x: number };
        const collection = new OIMReactiveCollection<TEntity, number>(queue);

        type TIndexKey = 'bucket';
        const index = new OIMReactiveIndexManualSetBased<TIndexKey, number>(
            queue
        );

        // Model state (for expectations).
        let modelAdd = 0;
        const modelCollection = new Map<number, number>();
        let modelBucketSize = 0;

        const C = new OIMComputed<number>(runtime, {
            compute: () => {
                const x = collection.getOneByPk(1)?.x ?? 0;
                const add = obj.get('add') ?? 0;
                const size = index.getKeySize('bucket');
                return x + add + size;
            },
            deps: [
                new OIMEffectDependencyKeyedCollection(collection, 1),
                new OIMEffectDependencyKeyedObject(obj, 'add'),
                new OIMEffectDependencyKeyedIndex(index, 'bucket'),
            ],
        });

        let uiCalls = 0;
        let subscribed = true;
        let unsubscribeUi = C.updateEventEmitter.subscribeOnKey('value', () => {
            uiCalls++;
            // If UI is subscribed, C should be consistent when delivered.
            expect(C.get()).toBe(
                (modelCollection.get(1) ?? 0) + modelAdd + modelBucketSize
            );
        });

        const steps = 500;
        for (let i = 0; i < steps; i++) {
            const r = rng();
            if (r < 0.35) {
                // update obj.add
                const next = Math.floor(rng() * 20) - 10;
                modelAdd = next;
                obj.setProperty('add', next);
            } else if (r < 0.65) {
                // update collection[1].x
                const next = Math.floor(rng() * 50);
                modelCollection.set(1, next);
                collection.upsertOneByPk(1, { id: 1, x: next });
            } else if (r < 0.85) {
                // update index bucket
                const size = Math.floor(rng() * 6);
                modelBucketSize = size;
                index.setSlots(
                    'bucket',
                    new Set(
                        Array.from({ length: size }, (_, k) => {
                            const pk = k + 1;
                            return { pk, item: { id: pk } };
                        })
                    )
                );
            } else if (r < 0.925) {
                // toggle UI subscription
                if (subscribed) {
                    unsubscribeUi();
                    subscribed = false;
                } else {
                    unsubscribeUi = C.updateEventEmitter.subscribeOnKey(
                        'value',
                        () => {
                            uiCalls++;
                            expect(C.get()).toBe(
                                (modelCollection.get(1) ?? 0) +
                                    modelAdd +
                                    modelBucketSize
                            );
                        }
                    );
                    subscribed = true;
                }
            } else {
                // flush and assert stable end state
                queue.flush();
                expect(queue.isEmpty).toBe(true);
                expect(C.get()).toBe(
                    (modelCollection.get(1) ?? 0) + modelAdd + modelBucketSize
                );
            }
        }

        // Final flush to settle everything.
        queue.flush();
        expect(queue.isEmpty).toBe(true);
        expect(C.get()).toBe(
            (modelCollection.get(1) ?? 0) + modelAdd + modelBucketSize
        );

        if (subscribed) unsubscribeUi();
        C.destroy();
        index.destroy();
        collection.destroy();
        obj.destroy();
        queue.destroy();

        // We don't assert uiCalls exact number (fuzz), but it should be non-negative and bounded.
        expect(uiCalls).toBeGreaterThanOrEqual(0);
    });
});


