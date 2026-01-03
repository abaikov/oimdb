import {
    EOIMEffectPhase,
    OIMEffect,
    OIMEffectDependencyComputed,
    OIMEffectDependencyKeyedObject,
    OIMEventQueue,
    OIMReactiveObject,
    OIMComputed,
} from '../src';

describe('OIMEffect', () => {
    test('runs in PRE before HANDLERS for the same source update', () => {
        type TKey = 'a';
        const queue = new OIMEventQueue();
        const obj = new OIMReactiveObject<TKey, number>(queue);

        const order: string[] = [];

        const pre = new OIMEffect(queue, {
            phase: EOIMEffectPhase.PRE,
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
            run: () => {
                order.push('pre');
            },
        });

        const handlers = new OIMEffect(queue, {
            phase: EOIMEffectPhase.HANDLERS,
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
            run: () => {
                order.push('handlers');
            },
        });

        obj.setProperty('a', 1);
        queue.flush();

        expect(order).toEqual(['pre', 'handlers']);

        handlers.destroy();
        pre.destroy();
        obj.destroy();
        queue.destroy();
    });

    test('coalesces multiple invalidations within a single flush (runs once)', () => {
        type TKey = 'a' | 'b';
        const queue = new OIMEventQueue();
        const obj = new OIMReactiveObject<TKey, number>(queue);

        let runs = 0;
        const effect = new OIMEffect(queue, {
            phase: EOIMEffectPhase.PRE,
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

    test('computed dependency: PRE effect runs in same flush, HANDLERS effect runs next flush', () => {
        type TKey = 'a';
        const queue = new OIMEventQueue();
        const obj = new OIMReactiveObject<TKey, number>(queue);

        const A = new OIMComputed<number>(queue, {
            compute: () => (obj.get('a') ?? 0) * 2,
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
        });

        let preRuns = 0;
        let handlerRuns = 0;

        const preEffect = new OIMEffect(queue, {
            phase: EOIMEffectPhase.PRE,
            deps: [
                new OIMEffectDependencyComputed({
                    emitter: A.emitter,
                    updateEventEmitter: A.updateEventEmitter,
                }),
            ],
            run: () => {
                preRuns++;
            },
        });

        const handlerEffect = new OIMEffect(queue, {
            phase: EOIMEffectPhase.HANDLERS,
            deps: [
                new OIMEffectDependencyComputed({
                    emitter: A.emitter,
                    updateEventEmitter: A.updateEventEmitter,
                }),
            ],
            run: () => {
                handlerRuns++;
            },
        });

        obj.setProperty('a', 2);

        // Flush 1: object -> computed recompute (pre), computed emits update => pre effect sees it immediately.
        queue.flush();
        expect(preRuns).toBe(1);
        expect(handlerRuns).toBe(0);

        // Flush 2: computed.updateEventEmitter dispatches to normal subscribers => handlers effect runs.
        queue.flush();
        expect(preRuns).toBe(1);
        expect(handlerRuns).toBe(1);

        handlerEffect.destroy();
        preEffect.destroy();
        A.destroy();
        obj.destroy();
        queue.destroy();
    });
});


