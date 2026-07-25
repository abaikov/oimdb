import {
    OIMEventQueue,
    OIMReactiveCollection,
} from '../src';

/**
 * `subscribeOnKeys` coalesces delivery so its handler fires at most once per
 * flush. That coalescing is gated on a counter of live multi-carrier
 * subscriptions, and these lock the counter's bookkeeping: it must come back
 * down every documented way a subscription can end, and it must never change
 * how OTHER subscriptions are delivered.
 */
describe('carrier emitter: multi-key subscription bookkeeping', () => {
    type Row = { id: string; n: number };

    const makeCollection = (queue: OIMEventQueue) =>
        new OIMReactiveCollection<Row, string>(queue, { selectPk: r => r.id });

    it('coalesces a subscribeOnKeys handler to one call per flush', () => {
        const queue = new OIMEventQueue();
        const collection = makeCollection(queue);

        let calls = 0;
        collection.subscribeOnKeys(['a', 'b', 'c'], () => {
            calls++;
        });

        collection.upsertOne({ id: 'a', n: 1 });
        collection.upsertOne({ id: 'b', n: 1 });
        collection.upsertOne({ id: 'c', n: 1 });
        queue.flush();

        expect(calls).toBe(1);
    });

    it('two separate single-key subscriptions of the SAME handler each deliver', () => {
        const queue = new OIMEventQueue();
        const collection = makeCollection(queue);

        let calls = 0;
        const handler = () => {
            calls++;
        };
        collection.subscribeOnKey('a', handler);
        collection.subscribeOnKey('b', handler);

        collection.upsertOne({ id: 'a', n: 1 });
        collection.upsertOne({ id: 'b', n: 1 });
        queue.flush();

        expect(calls).toBe(2);
    });

    it('an unrelated multi-key subscription does not change how single-key ones deliver', () => {
        const queue = new OIMEventQueue();
        const collection = makeCollection(queue);

        let shared = 0;
        const sharedHandler = () => {
            shared++;
        };
        collection.subscribeOnKey('a', sharedHandler);
        collection.subscribeOnKey('b', sharedHandler);

        // Unrelated subscription, different handler, different keys.
        collection.subscribeOnKeys(['x', 'y'], () => {
            /* noop */
        });

        collection.upsertOne({ id: 'a', n: 1 });
        collection.upsertOne({ id: 'b', n: 1 });
        queue.flush();

        // The shared handler is two INDEPENDENT single-key subscriptions, so it
        // owes two deliveries regardless of what else is subscribed.
        expect(shared).toBe(2);
    });

    it('unsubscribeFromKeys releases the coalescing gate, like the returned unsubscribe does', () => {
        const queue = new OIMEventQueue();
        const collection = makeCollection(queue);

        const multi = () => {
            /* noop */
        };
        collection.subscribeOnKeys(['x', 'y'], multi);
        // The documented alternative to calling the returned unsubscribe.
        collection.unsubscribeFromKeys(['x', 'y'], multi);

        let shared = 0;
        const sharedHandler = () => {
            shared++;
        };
        collection.subscribeOnKey('a', sharedHandler);
        collection.subscribeOnKey('b', sharedHandler);

        collection.upsertOne({ id: 'a', n: 1 });
        collection.upsertOne({ id: 'b', n: 1 });
        queue.flush();

        expect(shared).toBe(2);
    });
});
