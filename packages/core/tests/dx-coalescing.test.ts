import { OIMCollectionStoreMapDriven } from '../src/core/OIMCollectionStoreMapDriven';
import { OIMPkSelectorFactory } from '../src/core/OIMPkSelectorFactory';
import { OIMEntityUpdaterFactory } from '../src/core/OIMEntityUpdaterFactory';
import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMEventQueueSchedulerImmediate } from '../src/core/event-queue-scheduler/OIMEventQueueSchedulerImmediate';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';
import { OIMReactiveCollectionIndexManualSetBased } from '../src/core/OIMReactiveCollectionIndexManualSetBased';

interface User {
    id: string;
    name: string;
}

interface Order {
    id: string;
    userId: string;
    amount: number;
}

describe('Cross-Collection Coalescing', () => {
    let userCollection: OIMReactiveCollection<User, string>;
    let orderCollection: OIMReactiveCollection<Order, string>;
    let sharedQueue: OIMEventQueue;
    let scheduler: OIMEventQueueSchedulerImmediate;
    let userEmitter: {
        subscribeOnKey: (k: string, h: () => void) => () => void;
    };
    let orderEmitter: {
        subscribeOnKey: (k: string, h: () => void) => () => void;
    };

    beforeEach(() => {
        // CRITICAL: Create SHARED queue and scheduler
        scheduler = new OIMEventQueueSchedulerImmediate();
        sharedQueue = new OIMEventQueue({ scheduler });

        // Create collections bound to the SAME queue
        userCollection = new OIMReactiveCollection<User, string>(sharedQueue, {
            selectPk: new OIMPkSelectorFactory<
                User,
                string
            >().createIdSelector(),
            store: new OIMCollectionStoreMapDriven<User, string>(),
            updateEntity:
                new OIMEntityUpdaterFactory<User>().createMergeEntityUpdater(),
        });

        orderCollection = new OIMReactiveCollection<Order, string>(
            sharedQueue,
            {
                selectPk: new OIMPkSelectorFactory<
                    Order,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<Order, string>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<Order>().createMergeEntityUpdater(),
            }
        );

        userEmitter = userCollection;
        orderEmitter = orderCollection;
    });

    afterEach(() => {
        userCollection.destroy();
        orderCollection.destroy();
        sharedQueue.destroy();
    });

    test('should coalesce updates across different collections', () => {
        let totalNotifications = 0;
        const globalHandler = () => {
            totalNotifications++;
        };

        // Subscribe to related entities across collections
        userEmitter.subscribeOnKey('user123', globalHandler);
        orderEmitter.subscribeOnKey('order456', globalHandler);

        // Make multiple updates across collections
        userCollection.upsertOne({ id: 'user123', name: 'John' });
        orderCollection.upsertOne({
            id: 'order456',
            userId: 'user123',
            amount: 100,
        });
        userCollection.upsertOne({ id: 'user123', name: 'John Updated' });

        // Before processing: should have queued events
        expect(sharedQueue.length).toBeGreaterThan(0);

        // Process all events at once (coalescing happens here)
        sharedQueue.flush();

        // Should receive fewer notifications than updates due to coalescing
        expect(totalNotifications).toBe(2); // One for user, one for order
        expect(sharedQueue.length).toBe(0); // Queue should be empty after processing
    });

    test('should batch multiple updates within same collection', () => {
        let userNotifications = 0;
        const userHandler = () => {
            userNotifications++;
        };

        userEmitter.subscribeOnKey('user123', userHandler);

        // Multiple rapid updates to same entity
        userCollection.upsertOne({ id: 'user123', name: 'John' });
        userCollection.upsertOne({ id: 'user123', name: 'John Smith' });
        userCollection.upsertOne({ id: 'user123', name: 'John Doe' });

        // Should have queued events
        expect(sharedQueue.length).toBeGreaterThan(0);

        // Process events
        sharedQueue.flush();

        // Should receive only one notification despite 3 updates (coalesced)
        expect(userNotifications).toBe(1);
    });

    test('should handle updates to different entities separately', () => {
        let user123Notifications = 0;
        let user456Notifications = 0;

        userEmitter.subscribeOnKey('user123', () => user123Notifications++);
        userEmitter.subscribeOnKey('user456', () => user456Notifications++);

        // Update different entities
        userCollection.upsertOne({ id: 'user123', name: 'John' });
        userCollection.upsertOne({ id: 'user456', name: 'Jane' });

        sharedQueue.flush();

        // Should receive separate notifications for different entities
        expect(user123Notifications).toBe(1);
        expect(user456Notifications).toBe(1);
    });

    test('should work with batch operations', () => {
        let totalNotifications = 0;
        const globalHandler = () => {
            totalNotifications++;
        };

        userEmitter.subscribeOnKey('user123', globalHandler);
        userEmitter.subscribeOnKey('user456', globalHandler);
        orderEmitter.subscribeOnKey('order789', globalHandler);

        // Batch operations across collections
        userCollection.upsertMany([
            { id: 'user123', name: 'John' },
            { id: 'user456', name: 'Jane' },
        ]);

        orderCollection.upsertMany([
            { id: 'order789', userId: 'user123', amount: 100 },
        ]);

        sharedQueue.flush();

        // Should receive notifications for all affected entities
        expect(totalNotifications).toBe(3); // 2 users + 1 order
    });

    test('should demonstrate queue sharing between collections', () => {
        // This test proves that both collections use the same queue

        // Initially queue should be empty
        expect(sharedQueue.length).toBe(0);

        // Ensure there are subscriptions so updates actually schedule work.
        userEmitter.subscribeOnKey('user123', () => {});
        orderEmitter.subscribeOnKey('order456', () => {});

        // Update user collection
        userCollection.upsertOne({ id: 'user123', name: 'John' });
        expect(sharedQueue.length).toBe(1); // Queue has one item

        // Update order collection - should add to SAME queue
        orderCollection.upsertOne({
            id: 'order456',
            userId: 'user123',
            amount: 100,
        });
        expect(sharedQueue.length).toBe(2); // Queue now has two items

        // Process queue
        sharedQueue.flush();
        expect(sharedQueue.length).toBe(0); // Queue empty after processing
    });

    test('should handle mixed collection and index updates', () => {
        // Add an index to the mix (bound to the same queue)
        const index = new OIMReactiveCollectionIndexManualSetBased<
            string,
            string,
            User
        >(sharedQueue, { collection: userCollection });
        const indexEmitter = index;

        let totalNotifications = 0;
        const globalHandler = () => {
            totalNotifications++;
        };

        userEmitter.subscribeOnKey('user123', globalHandler);
        indexEmitter.subscribeOnKey('category:users', globalHandler);

        // Update both collection and index
        userCollection.upsertOne({ id: 'user123', name: 'John' });
        index.setPks('category:users', ['user123']);

        // Should have queued events from both sources
        expect(sharedQueue.length).toBe(2);

        sharedQueue.flush();

        // Should receive notifications from both sources
        expect(totalNotifications).toBe(2);

        // Cleanup
        index.destroy();
    });
});
