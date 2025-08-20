import { OIMCollection } from '../src/core/OIMCollection';
import { OIMCollectionStoreMapDriven } from '../src/core/OIMCollectionStoreMapDriven';
import { OIMPkSelectorFactory } from '../src/core/OIMPkSelectorFactory';
import { OIMEntityUpdaterFactory } from '../src/core/OIMEntityUpdaterFactory';
import { OIMUpdateEventCoalescerCollection } from '../src/core/OIMUpdateEventCoalescerCollection';
import { OIMUpdateEventEmitter } from '../src/core/OIMUpdateEventEmitter';
import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMEventQueueSchedulerImmediate } from '../src/core/event-queue-scheduler/OIMEventQueueSchedulerImmediate';
import { OIMIndexManual } from '../src/core/OIMIndexManual';
import { OIMUpdateEventCoalescerIndex } from '../src/core/OIMUpdateEventCoalescerIndex';

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
    let userCollection: OIMCollection<User, string>;
    let orderCollection: OIMCollection<Order, string>;
    let userCoalescer: OIMUpdateEventCoalescerCollection<string>;
    let orderCoalescer: OIMUpdateEventCoalescerCollection<string>;
    let sharedQueue: OIMEventQueue;
    let scheduler: OIMEventQueueSchedulerImmediate;
    let userEmitter: OIMUpdateEventEmitter<string>;
    let orderEmitter: OIMUpdateEventEmitter<string>;

    beforeEach(() => {
        // Create collections
        userCollection = new OIMCollection<User, string>({
            selectPk: new OIMPkSelectorFactory<
                User,
                string
            >().createIdSelector(),
            store: new OIMCollectionStoreMapDriven<User, string>(),
            updateEntity:
                new OIMEntityUpdaterFactory<User>().createMergeEntityUpdater(),
        });

        orderCollection = new OIMCollection<Order, string>({
            selectPk: new OIMPkSelectorFactory<
                Order,
                string
            >().createIdSelector(),
            store: new OIMCollectionStoreMapDriven<Order, string>(),
            updateEntity:
                new OIMEntityUpdaterFactory<Order>().createMergeEntityUpdater(),
        });

        // Create coalescers
        userCoalescer = new OIMUpdateEventCoalescerCollection(
            userCollection.emitter
        );
        orderCoalescer = new OIMUpdateEventCoalescerCollection(
            orderCollection.emitter
        );

        // CRITICAL: Create SHARED queue and scheduler
        scheduler = new OIMEventQueueSchedulerImmediate();
        sharedQueue = new OIMEventQueue({ scheduler });

        // Both emitters use the SAME queue
        userEmitter = new OIMUpdateEventEmitter({
            coalescer: userCoalescer,
            queue: sharedQueue, // Same queue!
        });

        orderEmitter = new OIMUpdateEventEmitter({
            coalescer: orderCoalescer,
            queue: sharedQueue, // Same queue!
        });
    });

    afterEach(() => {
        userEmitter.destroy();
        orderEmitter.destroy();
        userCoalescer.destroy();
        orderCoalescer.destroy();
        sharedQueue.destroy();
        userCollection.emitter.offAll();
        orderCollection.emitter.offAll();
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
        // Add an index to the mix
        const index = new OIMIndexManual<string, string>();
        const indexCoalescer = new OIMUpdateEventCoalescerIndex(index.emitter);
        const indexEmitter = new OIMUpdateEventEmitter({
            coalescer: indexCoalescer,
            queue: sharedQueue, // Same queue!
        });

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
        indexEmitter.destroy();
        indexCoalescer.destroy();
        index.destroy();
    });
});
