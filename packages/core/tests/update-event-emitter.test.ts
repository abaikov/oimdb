import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMUpdateEventEmitterQueued } from '../src/core/OIMUpdateEventEmitterQueued';
import { OIMUpdateEventEmitterAfterFlush } from '../src/core/OIMUpdateEventEmitterAfterFlush';
import { OIMUpdateEventEmitterImmediate } from '../src/core/OIMUpdateEventEmitterImmediate';

/**
 * The delivery core: every keyed subscription in the library lands here. Its three delivery modes,
 * its two notification paths and its two flush strategies were almost entirely untested.
 */
describe('OIMUpdateEventEmitter', () => {
    let queue: OIMEventQueue;

    beforeEach(() => {
        queue = new OIMEventQueue();
    });

    afterEach(() => {
        queue.destroy();
    });

    describe('delivery modes', () => {
        test('queue (default): nothing is delivered until the queue flushes', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            let hits = 0;
            emitter.subscribeOnKey('a', () => hits++);

            emitter.markUpdatedKey('a');
            expect(hits).toBe(0);

            queue.flush();
            expect(hits).toBe(1);
        });

        test('immediate: delivered synchronously, no flush involved', () => {
            const emitter = new OIMUpdateEventEmitterImmediate<string>(queue);
            let hits = 0;
            emitter.subscribeOnKey('a', () => hits++);

            emitter.markUpdatedKey('a');
            expect(hits).toBe(1); // already delivered

            queue.flush();
            expect(hits).toBe(1); // and not delivered a second time
        });

        test('after_flush: delivered once the queue has settled', () => {
            const emitter = new OIMUpdateEventEmitterAfterFlush<string>(queue);
            const order: string[] = [];
            emitter.subscribeOnKey('a', () => order.push('emitter'));
            queue.enqueue(() => order.push('queue task'));

            emitter.markUpdatedKey('a');
            expect(order).toEqual([]);

            queue.flush();
            expect(order).toEqual(['queue task', 'emitter']); // after, not during
        });
    });

    describe('coalescing and no-op paths', () => {
        test('repeated marks of the same key collapse into one notification', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            let hits = 0;
            emitter.subscribeOnKey('a', () => hits++);

            emitter.markUpdatedKey('a');
            emitter.markUpdatedKey('a');
            emitter.markUpdatedKeys(['a', 'a']);
            queue.flush();

            expect(hits).toBe(1);
        });

        test('marking with no subscriptions delivers nothing and stays clean', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            emitter.markUpdatedKey('a');
            emitter.markUpdatedKeys(['b', 'c']);
            emitter.markAllUpdated();
            expect(emitter.hasSubscriptions()).toBe(false);

            queue.flush();

            // A key marked while nobody listened must not be replayed to a later subscriber.
            let hits = 0;
            emitter.subscribeOnKey('a', () => hits++);
            queue.flush();
            expect(hits).toBe(0);
        });

        test('an empty key list is a no-op', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            let hits = 0;
            emitter.subscribeOnKey('a', () => hits++);
            emitter.markUpdatedKeys([]);
            queue.flush();
            expect(hits).toBe(0);
        });

        test('only subscribed keys are ever delivered', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            let hits = 0;
            emitter.subscribeOnKey('a', () => hits++);

            emitter.markUpdatedKeys(['a', 'unwatched']);
            queue.flush();
            expect(hits).toBe(1);
        });
    });

    describe('markAllUpdated', () => {
        test('notifies every subscribed key — the dense flush path', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            const seen: string[] = [];
            emitter.subscribeOnKey('a', () => seen.push('a'));
            emitter.subscribeOnKey('b', () => seen.push('b'));
            emitter.subscribeOnKey('c', () => seen.push('c'));

            emitter.markAllUpdated();
            queue.flush();

            expect(seen.sort()).toEqual(['a', 'b', 'c']);
        });

        test('works in immediate mode too', () => {
            const emitter = new OIMUpdateEventEmitterImmediate<string>(queue);
            const seen: string[] = [];
            emitter.subscribeOnKey('a', () => seen.push('a'));
            emitter.subscribeOnKey('b', () => seen.push('b'));

            emitter.markAllUpdated();
            expect(seen.sort()).toEqual(['a', 'b']);
        });

        test('and in after_flush mode', () => {
            const emitter = new OIMUpdateEventEmitterAfterFlush<string>(queue);
            let hits = 0;
            emitter.subscribeOnKey('a', () => hits++);

            emitter.markAllUpdated();
            expect(hits).toBe(0);
            queue.flush();
            expect(hits).toBe(1);
        });
    });

    describe('notification safety', () => {
        test('a lone handler takes the fast path and still fires', () => {
            const emitter = new OIMUpdateEventEmitterImmediate<string>(queue);
            let hits = 0;
            emitter.subscribeOnKey('a', () => hits++);
            emitter.markUpdatedKey('a');
            expect(hits).toBe(1);
        });

        test('a handler removed by a peer mid-notification is not called', () => {
            const emitter = new OIMUpdateEventEmitterImmediate<string>(queue);
            const seen: string[] = [];
            const third = () => seen.push('third');

            emitter.subscribeOnKey('a', () => seen.push('first'));
            emitter.subscribeOnKey('a', () => {
                seen.push('second');
                emitter.unsubscribeFromKey('a', third);
            });
            emitter.subscribeOnKey('a', third);

            emitter.markUpdatedKey('a');
            expect(seen).toEqual(['first', 'second']);
        });
    });

    describe('multi-key subscriptions', () => {
        test('one handler across several keys fires for each of them', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            let hits = 0;
            emitter.subscribeOnKeys(['a', 'b'], () => hits++);

            emitter.markUpdatedKey('a');
            queue.flush();
            expect(hits).toBe(1);

            emitter.markUpdatedKey('b');
            queue.flush();
            expect(hits).toBe(2);
        });

        test('unsubscribing from the set stops every one of them', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            let hits = 0;
            const handler = () => hits++;
            emitter.subscribeOnKeys(['a', 'b'], handler);
            emitter.unsubscribeFromKeys(['a', 'b'], handler);

            emitter.markUpdatedKeys(['a', 'b']);
            queue.flush();
            expect(hits).toBe(0);
            expect(emitter.hasSubscriptions()).toBe(false);
        });

        test('the returned unsubscribe is equivalent to unsubscribing by hand', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            let hits = 0;
            const stop = emitter.subscribeOnKey('a', () => hits++);
            stop();

            emitter.markUpdatedKey('a');
            queue.flush();
            expect(hits).toBe(0);
        });
    });

    describe('reentrancy', () => {
        test('marking during a flush is refused in queue mode', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            let thrown: Error | undefined;
            emitter.subscribeOnKey('a', () => {
                try {
                    emitter.markUpdatedKey('b');
                } catch (e) {
                    thrown = e as Error;
                }
            });

            emitter.markUpdatedKey('a');
            queue.flush();

            expect(thrown?.message).toMatch(/updates during queue.flush\(\)/);
        });

        test('markAllUpdated during a flush is refused as well', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            let thrown: Error | undefined;
            emitter.subscribeOnKey('a', () => {
                try {
                    emitter.markAllUpdated();
                } catch (e) {
                    thrown = e as Error;
                }
            });

            emitter.markUpdatedKey('a');
            queue.flush();

            expect(thrown?.message).toMatch(/updates during queue.flush\(\)/);
        });
    });

    describe('bookkeeping', () => {
        test('handler counts and subscription state track add and remove', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            expect(emitter.hasSubscriptions()).toBe(false);
            expect(emitter.getHandlerCount('a')).toBe(0);

            const stopA = emitter.subscribeOnKey('a', () => undefined);
            const stopB = emitter.subscribeOnKey('a', () => undefined);
            expect(emitter.getHandlerCount('a')).toBe(2);
            expect(emitter.hasSubscriptions()).toBe(true);

            stopA();
            expect(emitter.getHandlerCount('a')).toBe(1);
            stopB();
            expect(emitter.getHandlerCount('a')).toBe(0);
            expect(emitter.hasSubscriptions()).toBe(false);
        });

        test('metrics report what is registered', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            emitter.subscribeOnKey('a', () => undefined);
            emitter.subscribeOnKey('b', () => undefined);

            const metrics = emitter.getMetrics();
            expect(metrics).toBeDefined();
            expect(JSON.stringify(metrics)).toContain('2');
        });

        test('unsubscribing a handler that was never added is harmless', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            expect(() =>
                emitter.unsubscribeFromKey('a', () => undefined)
            ).not.toThrow();
            expect(() =>
                emitter.unsubscribeFromKeys(['a'], () => undefined)
            ).not.toThrow();
        });
    });

    describe('destroy', () => {
        test('cancels a pending flush so nothing is delivered afterwards', () => {
            const emitter = new OIMUpdateEventEmitterQueued<string>(queue);
            let hits = 0;
            emitter.subscribeOnKey('a', () => hits++);

            emitter.markUpdatedKey('a');
            emitter.destroy();
            queue.flush();

            expect(hits).toBe(0);
        });

        test('detaches from the queue in after_flush mode', () => {
            const emitter = new OIMUpdateEventEmitterAfterFlush<string>(queue);
            let hits = 0;
            emitter.subscribeOnKey('a', () => hits++);

            emitter.markUpdatedKey('a');
            emitter.destroy();
            queue.flush();

            expect(hits).toBe(0);
        });
    });
});
