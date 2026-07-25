import { OIMEventQueue } from '@oimdb/core';
import { OIMUpdateEventEmitterAsync } from '../src/core/OIMUpdateEventEmitterAsync';

describe('OIMUpdateEventEmitterAsync', () => {
    let queue: OIMEventQueue;
    let emitter: OIMUpdateEventEmitterAsync<string>;

    beforeEach(() => {
        // No scheduler → drive delivery deterministically via queue.flush().
        queue = new OIMEventQueue();
        emitter = new OIMUpdateEventEmitterAsync<string>(queue);
    });

    afterEach(() => {
        emitter.destroy();
        queue.destroy();
    });

    test('subscribeOnKeys is coalesced: one call per flush however many keys changed', () => {
        const handler = jest.fn();
        emitter.subscribeOnKeys(['a', 'b', 'c'], handler);

        emitter.markUpdatedKeys(['a', 'b']);
        queue.flush();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    test('coalescing is per flush: separate flushes deliver separately', () => {
        const handler = jest.fn();
        emitter.subscribeOnKeys(['a', 'b'], handler);

        emitter.markUpdatedKey('a');
        queue.flush();
        emitter.markUpdatedKey('b');
        queue.flush();

        expect(handler).toHaveBeenCalledTimes(2);
    });

    test('distinct handlers each fire once (dedup is per-handler, not global)', () => {
        const h1 = jest.fn();
        const h2 = jest.fn();
        emitter.subscribeOnKeys(['a', 'b'], h1);
        emitter.subscribeOnKeys(['b', 'c'], h2);

        emitter.markUpdatedKeys(['a', 'b', 'c']);
        queue.flush();

        expect(h1).toHaveBeenCalledTimes(1);
        expect(h2).toHaveBeenCalledTimes(1);
    });

    test('single-key subscriptions are unaffected (hot path, no dedup gate)', () => {
        const h1 = jest.fn();
        const h2 = jest.fn();
        emitter.subscribeOnKey('a', h1);
        emitter.subscribeOnKey('b', h2);

        emitter.markUpdatedKeys(['a', 'b']);
        queue.flush();

        expect(h1).toHaveBeenCalledTimes(1);
        expect(h2).toHaveBeenCalledTimes(1);
    });

    test('the returned unsubscribe stops delivery', () => {
        const handler = jest.fn();
        const off = emitter.subscribeOnKeys(['a', 'b'], handler);
        off();

        emitter.markUpdatedKeys(['a', 'b']);
        queue.flush();

        expect(handler).not.toHaveBeenCalled();
    });

    test('unsubscribeFromKeys removes a subscribeOnKeys handler (identity preserved)', () => {
        const handler = jest.fn();
        emitter.subscribeOnKeys(['a', 'b'], handler);
        emitter.unsubscribeFromKeys(['a', 'b'], handler);

        emitter.markUpdatedKeys(['a', 'b']);
        queue.flush();

        expect(handler).not.toHaveBeenCalled();
    });

    test('a handler unsubscribing another mid-delivery does not corrupt the walk', () => {
        const h2 = jest.fn();
        const h1 = jest.fn(() => emitter.unsubscribeFromKey('a', h2));
        emitter.subscribeOnKey('a', h1);
        emitter.subscribeOnKey('a', h2);

        emitter.markUpdatedKey('a');
        queue.flush();

        expect(h1).toHaveBeenCalledTimes(1);
        // h2 was removed before the walk reached it (guarded by handlers.has).
        expect(h2).not.toHaveBeenCalled();
    });
});
