import {
    OIMEffect,
    OIMComputativeRuntime,
    OIMEffectDependencyComputed,
    OIMEffectDependencyKeyedObject,
    OIMEventQueue,
    OIMReactiveObject,
    OIMComputed,
} from '../src';

describe('OIMEffect', () => {
    test('runs handlers in subscription order for the same key', () => {
        type TKey = 'a';
        const queue = new OIMEventQueue();
        const runtime = new OIMComputativeRuntime(queue);
        const obj = new OIMReactiveObject<TKey, number>(queue);

        const order: string[] = [];

        const a = new OIMEffect(runtime, {
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
            run: () => {
                order.push('a');
            },
        });

        const b = new OIMEffect(runtime, {
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
            run: () => {
                order.push('b');
            },
        });

        obj.setProperty('a', 1);
        queue.flush();

        expect(order).toEqual(['a', 'b']);

        b.destroy();
        a.destroy();
        obj.destroy();
        queue.destroy();
    });

    test('coalesces multiple invalidations within a single flush (runs once)', () => {
        type TKey = 'a' | 'b';
        const queue = new OIMEventQueue();
        const runtime = new OIMComputativeRuntime(queue);
        const obj = new OIMReactiveObject<TKey, number>(queue);

        let runs = 0;
        const effect = new OIMEffect(runtime, {
            deps: [
                new OIMEffectDependencyKeyedObject(obj, 'a'),
                new OIMEffectDependencyKeyedObject(obj, 'b'),
            ],
            run: () => {
                runs++;
            },
        });

        obj.merge({ a: 1, b: 2 });
        queue.flush();

        expect(runs).toBe(1);

        effect.destroy();
        obj.destroy();
        queue.destroy();
    });

    test('computed dependency: effect runs when computed updates (same drain)', () => {
        type TKey = 'a';
        const queue = new OIMEventQueue();
        const runtime = new OIMComputativeRuntime(queue);
        const obj = new OIMReactiveObject<TKey, number>(queue);

        const A = new OIMComputed<number>(runtime, {
            compute: () => (obj.get('a') ?? 0) * 2,
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
        });

        let runs = 0;

        const effect = new OIMEffect(runtime, {
            deps: [
                new OIMEffectDependencyComputed({
                    emitter: A.emitter,
                    updateEventEmitter: A.updateEventEmitter,
                }),
            ],
            run: () => {
                runs++;
            },
        });

        obj.setProperty('a', 2);

        queue.flush();
        expect(runs).toBe(1);

        effect.destroy();
        A.destroy();
        obj.destroy();
        queue.destroy();
    });
});


