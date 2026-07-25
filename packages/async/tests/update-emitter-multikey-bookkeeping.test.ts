import { OIMReactiveCollectionAsync } from '../src/core/OIMReactiveCollectionAsync';
import { OIMCollectionStoreAsyncMock } from './OIMCollectionStoreAsyncMock';
import { OIMEventQueue } from '@oimdb/core';

interface TOIMRow {
    id: string;
    n: number;
}

/**
 * Mirrors the core carrier-emitter bookkeeping contract: `subscribeOnKeys`
 * coalesces its handler to one call per flush, and that coalescing must neither
 * leak (staying latched after unsubscribe) nor bleed into unrelated single-key
 * subscriptions.
 */
describe('async update emitter: multi-key subscription bookkeeping', () => {
    let queue: OIMEventQueue;
    let collection: OIMReactiveCollectionAsync<TOIMRow, string>;

    beforeEach(() => {
        queue = new OIMEventQueue(); // manual flush
        collection = new OIMReactiveCollectionAsync<TOIMRow, string>(queue, {
            store: new OIMCollectionStoreAsyncMock<TOIMRow, string>(),
        });
    });

    afterEach(() => {
        queue.destroy();
    });

    it('coalesces a subscribeOnKeys handler to one call per flush', async () => {
        let calls = 0;
        collection.subscribeOnKeys(['a', 'b', 'c'], () => {
            calls++;
        });

        await collection.upsertOne({ id: 'a', n: 1 });
        await collection.upsertOne({ id: 'b', n: 1 });
        await collection.upsertOne({ id: 'c', n: 1 });
        queue.flush();

        expect(calls).toBe(1);
    });

    it('an unrelated multi-key subscription does not change single-key delivery', async () => {
        let shared = 0;
        const sharedHandler = () => {
            shared++;
        };
        collection.subscribeOnKey('a', sharedHandler);
        collection.subscribeOnKey('b', sharedHandler);

        collection.subscribeOnKeys(['x', 'y'], () => {
            /* noop */
        });

        await collection.upsertOne({ id: 'a', n: 1 });
        await collection.upsertOne({ id: 'b', n: 1 });
        queue.flush();

        // Two independent single-key subscriptions owe two deliveries.
        expect(shared).toBe(2);
    });

    it('unsubscribeFromKeys releases the coalescing gate', async () => {
        const multi = () => {
            /* noop */
        };
        collection.subscribeOnKeys(['x', 'y'], multi);
        collection.unsubscribeFromKeys(['x', 'y'], multi);

        let shared = 0;
        const sharedHandler = () => {
            shared++;
        };
        collection.subscribeOnKey('a', sharedHandler);
        collection.subscribeOnKey('b', sharedHandler);

        await collection.upsertOne({ id: 'a', n: 1 });
        await collection.upsertOne({ id: 'b', n: 1 });
        queue.flush();

        expect(shared).toBe(2);
    });
});
