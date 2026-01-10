import { OIMCollectionStoreMapDriven } from '../src/core/OIMCollectionStoreMapDriven';
import { OIMPkSelectorFactory } from '../src/core/OIMPkSelectorFactory';
import { OIMEntityUpdaterFactory } from '../src/core/OIMEntityUpdaterFactory';
import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMEventQueueSchedulerImmediate } from '../src/core/event-queue-scheduler/OIMEventQueueSchedulerImmediate';
import { OIMEventQueueSchedulerTimeout } from '../src/core/event-queue-scheduler/OIMEventQueueSchedulerTimeout';
import { OIMEventQueueSchedulerMicrotask } from '../src/core/event-queue-scheduler/OIMEventQueueSchedulerMicrotask';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';

type TOIMKeyedEmitter<TKey extends string> = {
    subscribeOnKey(key: TKey, handler: () => void): () => void;
    subscribeOnKeys(keys: readonly TKey[], handler: () => void): () => void;
    hasSubscriptions(): boolean;
    getHandlerCount(key: TKey): number;
    getMetrics(): {
        totalKeys: number;
        totalHandlers: number;
        averageHandlersPerKey: number;
        queueLength: number;
    };
    unsubscribeFromKey(key: TKey, handler: () => void): void;
};

interface TOIMUser {
    id: string;
    name: string;
    age: number;
    department: string;
}

interface TOIMProject {
    id: string;
    title: string;
    status: 'active' | 'completed' | 'cancelled';
    assignedUsers: string[];
}

describe('Integration Tests', () => {
    describe('Complete Event Flow', () => {
        let collection: OIMReactiveCollection<TOIMUser, string>;
        let queue: OIMEventQueue;
        let emitter: TOIMKeyedEmitter<string>;
        let scheduler: OIMEventQueueSchedulerImmediate;

        beforeEach(() => {
            scheduler = new OIMEventQueueSchedulerImmediate();
            queue = new OIMEventQueue({ scheduler });

            collection = new OIMReactiveCollection<TOIMUser, string>(queue, {
                selectPk: new OIMPkSelectorFactory<
                    TOIMUser,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TOIMUser, string>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMUser>().createMergeEntityUpdater(),
            });
            emitter = collection;
        });

        afterEach(() => {
            collection.destroy();
            queue.destroy();
        });

        test('should handle complete workflow: insert -> subscribe -> update -> notify', async () => {
            const notifications: string[] = [];

            // Step 1: Insert initial data
            const users: TOIMUser[] = [
                {
                    id: 'user1',
                    name: 'Alice',
                    age: 30,
                    department: 'Engineering',
                },
                { id: 'user2', name: 'Bob', age: 25, department: 'Design' },
                {
                    id: 'user3',
                    name: 'Charlie',
                    age: 35,
                    department: 'Engineering',
                },
            ];

            collection.upsertMany(users);

            // Step 2: Subscribe to specific users
            emitter.subscribeOnKey('user1', () => {
                notifications.push('user1 updated');
            });

            emitter.subscribeOnKey('user2', () => {
                notifications.push('user2 updated');
            });

            // Step 3: Trigger scheduler to process initial events
            queue.flush();

            // Clear initial notifications from insertion
            notifications.length = 0;

            // Step 4: Update users
            collection.upsertOne({
                id: 'user1',
                name: 'Alice Smith',
                age: 31,
                department: 'Engineering',
            });
            collection.upsertOne({
                id: 'user3',
                name: 'Charlie Brown',
                age: 36,
                department: 'Engineering',
            });

            // Step 5: Process updates
            queue.flush();

            // Verify notifications
            expect(notifications).toContain('user1 updated');
            expect(notifications).not.toContain('user2 updated'); // user2 was not updated
            expect(notifications).not.toContain('user3 updated'); // user3 has no subscriber
        });

        test('should handle batch operations efficiently', () => {
            const notifications: string[] = [];

            // Subscribe to multiple users
            emitter.subscribeOnKeys(['user1', 'user2', 'user3'], () => {
                notifications.push('batch notification');
            });

            // Insert batch of users
            const users: TOIMUser[] = [
                {
                    id: 'user1',
                    name: 'Alice',
                    age: 30,
                    department: 'Engineering',
                },
                { id: 'user2', name: 'Bob', age: 25, department: 'Design' },
                {
                    id: 'user3',
                    name: 'Charlie',
                    age: 35,
                    department: 'Engineering',
                },
            ];

            collection.upsertMany(users);
            queue.flush();

            // Should receive notifications for all subscribed users
            expect(notifications.length).toBe(3); // One for each user

            notifications.length = 0; // Clear notifications

            // Update multiple users in batch
            collection.upsertMany([
                {
                    id: 'user1',
                    name: 'Alice Updated',
                    age: 31,
                    department: 'Engineering',
                },
                {
                    id: 'user2',
                    name: 'Bob Updated',
                    age: 26,
                    department: 'Design',
                },
            ]);

            queue.flush();

            // Should receive notifications for updated users
            expect(notifications.length).toBe(2);
        });

        test('should coalesce multiple rapid updates', () => {
            const notifications: string[] = [];

            emitter.subscribeOnKey('user1', () => {
                notifications.push('user1 notification');
            });

            // Make multiple rapid updates before processing
            collection.upsertOne({
                id: 'user1',
                name: 'Alice',
                age: 30,
                department: 'Engineering',
            });
            collection.upsertOne({
                id: 'user1',
                name: 'Alice Smith',
                age: 31,
                department: 'Engineering',
            });
            collection.upsertOne({
                id: 'user1',
                name: 'Alice Johnson',
                age: 32,
                department: 'Engineering',
            });

            // Process all at once
            queue.flush();

            // Should only receive one notification despite multiple updates
            expect(notifications.length).toBe(1);
        });
    });

    describe('Different Schedulers Integration', () => {
        test('should work with immediate scheduler', done => {
            const scheduler = new OIMEventQueueSchedulerImmediate();
            const queue = new OIMEventQueue({ scheduler });
            const collection = new OIMReactiveCollection<TOIMUser, string>(queue, {
                selectPk: new OIMPkSelectorFactory<
                    TOIMUser,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TOIMUser, string>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMUser>().createMergeEntityUpdater(),
            });
            const emitter = collection;

            const notifications: string[] = [];

            emitter.subscribeOnKey('user1', () => {
                notifications.push('immediate notification');

                // Verify notification was received immediately
                expect(notifications.length).toBe(1);

                collection.destroy();
                queue.destroy();
                done();
            });

            // This should trigger immediate processing
            collection.upsertOne({
                id: 'user1',
                name: 'Alice',
                age: 30,
                department: 'Engineering',
            });
        });

        test('should work with timeout scheduler', done => {
            const scheduler = new OIMEventQueueSchedulerTimeout(10);
            const queue = new OIMEventQueue({ scheduler });
            const collection = new OIMReactiveCollection<TOIMUser, string>(queue, {
                selectPk: new OIMPkSelectorFactory<
                    TOIMUser,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TOIMUser, string>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMUser>().createMergeEntityUpdater(),
            });
            const emitter = collection;

            const notifications: string[] = [];

            emitter.subscribeOnKey('user1', () => {
                notifications.push('timeout notification');

                expect(notifications.length).toBe(1);

                collection.destroy();
                queue.destroy();
                scheduler.cancel();
                done();
            });

            collection.upsertOne({
                id: 'user1',
                name: 'Alice',
                age: 30,
                department: 'Engineering',
            });

            // Should not be called immediately
            expect(notifications.length).toBe(0);
        });

        test('should work with microtask scheduler', done => {
            const scheduler = new OIMEventQueueSchedulerMicrotask();
            const queue = new OIMEventQueue({ scheduler });
            const collection = new OIMReactiveCollection<TOIMUser, string>(queue, {
                selectPk: new OIMPkSelectorFactory<
                    TOIMUser,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TOIMUser, string>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMUser>().createMergeEntityUpdater(),
            });
            const emitter = collection;

            const notifications: string[] = [];

            emitter.subscribeOnKey('user1', () => {
                notifications.push('microtask notification');

                expect(notifications.length).toBe(1);

                collection.destroy();
                queue.destroy();
                done();
            });

            collection.upsertOne({
                id: 'user1',
                name: 'Alice',
                age: 30,
                department: 'Engineering',
            });

            // Should not be called immediately but in next microtask
            expect(notifications.length).toBe(0);
        });
    });

    describe('Multi-Collection Scenario', () => {
        let userCollection: OIMReactiveCollection<TOIMUser, string>;
        let projectCollection: OIMReactiveCollection<TOIMProject, string>;
        let scheduler: OIMEventQueueSchedulerImmediate;
        let queue: OIMEventQueue;
        let userEmitter: TOIMKeyedEmitter<string>;
        let projectEmitter: TOIMKeyedEmitter<string>;

        beforeEach(() => {
            scheduler = new OIMEventQueueSchedulerImmediate();
            queue = new OIMEventQueue({ scheduler });

            // Setup user collection
            userCollection = new OIMReactiveCollection<TOIMUser, string>(queue, {
                selectPk: new OIMPkSelectorFactory<
                    TOIMUser,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TOIMUser, string>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMUser>().createMergeEntityUpdater(),
            });

            // Setup project collection
            projectCollection = new OIMReactiveCollection<TOIMProject, string>(queue, {
                selectPk: new OIMPkSelectorFactory<
                    TOIMProject,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TOIMProject, string>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMProject>().createMergeEntityUpdater(),
            });

            userEmitter = userCollection;
            projectEmitter = projectCollection;
        });

        afterEach(() => {
            userCollection.destroy();
            projectCollection.destroy();
            queue.destroy();
        });

        test('should handle updates across multiple collections', () => {
            const userNotifications: string[] = [];
            const projectNotifications: string[] = [];

            // Subscribe to specific entities in both collections
            userEmitter.subscribeOnKey('user1', () => {
                userNotifications.push('user1 updated');
            });

            projectEmitter.subscribeOnKey('project1', () => {
                projectNotifications.push('project1 updated');
            });

            // Update both collections
            userCollection.upsertOne({
                id: 'user1',
                name: 'Alice',
                age: 30,
                department: 'Engineering',
            });

            projectCollection.upsertOne({
                id: 'project1',
                title: 'New Website',
                status: 'active',
                assignedUsers: ['user1'],
            });

            // Process all updates
            queue.flush();

            expect(userNotifications).toContain('user1 updated');
            expect(projectNotifications).toContain('project1 updated');
        });

        test('should share queue between collections efficiently', () => {
            const allNotifications: string[] = [];

            // Subscribe to multiple entities across collections
            userEmitter.subscribeOnKeys(['user1', 'user2'], () => {
                allNotifications.push('user updated');
            });

            projectEmitter.subscribeOnKeys(['project1', 'project2'], () => {
                allNotifications.push('project updated');
            });

            // Batch update both collections
            userCollection.upsertMany([
                {
                    id: 'user1',
                    name: 'Alice',
                    age: 30,
                    department: 'Engineering',
                },
                { id: 'user2', name: 'Bob', age: 25, department: 'Design' },
            ]);

            projectCollection.upsertMany([
                {
                    id: 'project1',
                    title: 'Website',
                    status: 'active',
                    assignedUsers: ['user1'],
                },
                {
                    id: 'project2',
                    title: 'Mobile App',
                    status: 'active',
                    assignedUsers: ['user2'],
                },
            ]);

            // All updates should be processed in a single flush
            queue.flush();

            // Should receive notifications for all updated entities
            expect(allNotifications.length).toBe(4); // 2 users + 2 projects
        });
    });

    describe('Performance Edge Cases', () => {
        let collection: OIMReactiveCollection<TOIMUser, string>;
        let queue: OIMEventQueue;
        let emitter: TOIMKeyedEmitter<string>;
        let scheduler: OIMEventQueueSchedulerImmediate;

        beforeEach(() => {
            scheduler = new OIMEventQueueSchedulerImmediate();
            queue = new OIMEventQueue({ scheduler });
            collection = new OIMReactiveCollection<TOIMUser, string>(queue, {
                selectPk: new OIMPkSelectorFactory<
                    TOIMUser,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<TOIMUser, string>(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMUser>().createMergeEntityUpdater(),
            });
            emitter = collection;
        });

        afterEach(() => {
            collection.destroy();
            queue.destroy();
        });

        test('should handle large number of subscriptions efficiently', () => {
            const notifications: number[] = [];

            // Create 1000 subscriptions
            for (let i = 0; i < 1000; i++) {
                emitter.subscribeOnKey(`user${i}`, () => {
                    notifications.push(i);
                });
            }

            // Update only a few entities
            collection.upsertMany([
                {
                    id: 'user1',
                    name: 'User 1',
                    age: 30,
                    department: 'Engineering',
                },
                {
                    id: 'user500',
                    name: 'User 500',
                    age: 25,
                    department: 'Design',
                },
                {
                    id: 'user999',
                    name: 'User 999',
                    age: 35,
                    department: 'Marketing',
                },
            ]);

            queue.flush();

            // Only subscribed handlers for updated entities should be called
            expect(notifications).toEqual(
                expect.arrayContaining([1, 500, 999])
            );
            expect(notifications.length).toBe(3);

            // Verify metrics
            const metrics = emitter.getMetrics();
            expect(metrics.totalKeys).toBe(1000);
            expect(metrics.totalHandlers).toBe(1000);
        });

        test('should handle rapid subscribe/unsubscribe cycles', () => {
            const handler = jest.fn();

            // Rapid subscribe/unsubscribe cycles
            for (let i = 0; i < 100; i++) {
                emitter.subscribeOnKey('user1', handler);
                emitter.unsubscribeFromKey('user1', handler);
            }

            // Should have no active subscriptions
            expect(emitter.hasSubscriptions()).toBe(false);
            expect(emitter.getHandlerCount('user1')).toBe(0);

            // Update should not trigger any handlers
            collection.upsertOne({
                id: 'user1',
                name: 'Alice',
                age: 30,
                department: 'Engineering',
            });
            queue.flush();

            expect(handler).not.toHaveBeenCalled();
        });

        test('should handle empty updates gracefully', () => {
            const handler = jest.fn();
            emitter.subscribeOnKey('user1', handler);

            // Empty batch updates
            collection.upsertMany([]);
            collection.removeMany([]);

            queue.flush();

            // Should not trigger handlers for empty updates
            expect(handler).not.toHaveBeenCalled();
        });

        test('should maintain performance with deeply nested event chains', () => {
            let depth = 0;
            const maxDepth = 10;

            const createNestedHandler = (
                currentDepth: number
            ): (() => void) => {
                return () => {
                    depth = Math.max(depth, currentDepth);
                    if (currentDepth < maxDepth) {
                        // Trigger another update from within handler
                        collection.upsertOne({
                            id: `user${currentDepth + 1}`,
                            name: `User ${currentDepth + 1}`,
                            age: 20 + currentDepth,
                            department: 'Engineering',
                        });
                    }
                };
            };

            // Subscribe handlers that trigger more updates
            for (let i = 1; i <= maxDepth; i++) {
                emitter.subscribeOnKey(`user${i}`, createNestedHandler(i));
            }

            // Start the chain
            collection.upsertOne({
                id: 'user1',
                name: 'User 1',
                age: 20,
                department: 'Engineering',
            });

            // Writes during queue.flush() are forbidden.
            expect(() => queue.flush()).toThrow();
            expect(depth).toBeGreaterThanOrEqual(1);
        });
    });
});
