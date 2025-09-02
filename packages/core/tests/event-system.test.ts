import { OIMUpdateEventEmitter } from '../src/core/OIMUpdateEventEmitter';
import { OIMUpdateEventCoalescerCollection } from '../src/core/OIMUpdateEventCoalescerCollection';
import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMCollection } from '../src/core/OIMCollection';
import { OIMCollectionStoreMapDriven } from '../src/core/OIMCollectionStoreMapDriven';
import { OIMPkSelectorFactory } from '../src/core/OIMPkSelectorFactory';
import { OIMEntityUpdaterFactory } from '../src/core/OIMEntityUpdaterFactory';
import { OIMEventQueueSchedulerImmediate } from '../src/core/event-queue-scheduler/OIMEventQueueSchedulerImmediate';
import { EOIMUpdateEventCoalescerEventType } from '../src/types/EOIMUpdateEventCoalescerEventType';

interface TOIMTestEntity {
    id: string;
    name: string;
    value: number;
}

describe('Event System', () => {
    describe('OIMCollectionUpdateEventCoalescer', () => {
        let collection: OIMCollection<TOIMTestEntity, string>;
        let coalescer: OIMUpdateEventCoalescerCollection<string>;

        beforeEach(() => {
            collection = new OIMCollection<TOIMTestEntity, string>({
                selectPk: new OIMPkSelectorFactory<
                    TOIMTestEntity,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<
                    TOIMTestEntity,
                    string
                >(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMTestEntity>().createMergeEntityUpdater(),
            });

            coalescer = new OIMUpdateEventCoalescerCollection(
                collection.emitter
            );
        });

        afterEach(() => {
            coalescer.destroy();
            collection.emitter.offAll();
        });

        test('should track updated PKs when collection is updated', () => {
            const entity1: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            const entity2: TOIMTestEntity = {
                id: 'test2',
                name: 'Test 2',
                value: 20,
            };

            collection.upsertOne(entity1);
            collection.upsertOne(entity2);

            const updatedPks = coalescer.getUpdatedKeys();
            expect(updatedPks.has('test1')).toBe(true);
            expect(updatedPks.has('test2')).toBe(true);
            expect(updatedPks.size).toBe(2);
        });

        test('should emit HAS_CHANGES event only once for multiple updates', () => {
            const changesSpy = jest.fn();
            coalescer.emitter.on(
                EOIMUpdateEventCoalescerEventType.HAS_CHANGES,
                changesSpy
            );

            const entity1: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            const entity2: TOIMTestEntity = {
                id: 'test2',
                name: 'Test 2',
                value: 20,
            };

            collection.upsertOne(entity1);
            collection.upsertOne(entity2);

            // Should emit only once even for multiple updates
            expect(changesSpy).toHaveBeenCalledTimes(1);
        });

        test('should clear updated PKs', () => {
            const entity: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            collection.upsertOne(entity);

            expect(coalescer.getUpdatedKeys().size).toBe(1);

            coalescer.clearUpdatedKeys();

            expect(coalescer.getUpdatedKeys().size).toBe(0);
        });

        test('should handle multiple updates to same entity', () => {
            const entity1: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            const entity2: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1 Updated',
                value: 20,
            };

            collection.upsertOne(entity1);
            collection.upsertOne(entity2);

            const updatedPks = coalescer.getUpdatedKeys();
            expect(updatedPks.has('test1')).toBe(true);
            expect(updatedPks.size).toBe(1); // Same PK, so only one entry
        });
    });

    describe('OIMEventQueue', () => {
        let queue: OIMEventQueue;
        let scheduler: OIMEventQueueSchedulerImmediate;

        beforeEach(() => {
            scheduler = new OIMEventQueueSchedulerImmediate();
            queue = new OIMEventQueue({ scheduler });
        });

        afterEach(() => {
            queue.destroy();
        });

        test('should enqueue and execute functions', () => {
            const mockFn1 = jest.fn();
            const mockFn2 = jest.fn();

            queue.enqueue(mockFn1);
            queue.enqueue(mockFn2);

            expect(queue.length).toBe(2);
            expect(mockFn1).not.toHaveBeenCalled();
            expect(mockFn2).not.toHaveBeenCalled();

            queue.flush();

            expect(mockFn1).toHaveBeenCalledTimes(1);
            expect(mockFn2).toHaveBeenCalledTimes(1);
            expect(queue.length).toBe(0);
        });

        test('should schedule flush automatically when scheduler is provided', () => {
            const mockFn = jest.fn();
            const scheduleSpy = jest.spyOn(scheduler, 'schedule');

            queue.enqueue(mockFn);

            expect(scheduleSpy).toHaveBeenCalledTimes(1);
        });

        test('should not schedule if queue is not empty', () => {
            const mockFn1 = jest.fn();
            const mockFn2 = jest.fn();
            const scheduleSpy = jest.spyOn(scheduler, 'schedule');

            queue.enqueue(mockFn1);
            queue.enqueue(mockFn2);

            // Should only schedule once when transitioning from empty to non-empty
            expect(scheduleSpy).toHaveBeenCalledTimes(1);
        });

        test('should handle reentrancy safely', () => {
            const results: number[] = [];

            const fn1 = () => {
                results.push(1);
                queue.enqueue(() => results.push(3)); // Reentrant enqueue
            };
            const fn2 = () => results.push(2);

            queue.enqueue(fn1);
            queue.enqueue(fn2);

            queue.flush();

            expect(results).toEqual([1, 2]); // Reentrant function not executed in same flush
            expect(queue.length).toBe(1); // Reentrant function still in queue

            queue.flush();
            expect(results).toEqual([1, 2, 3]); // Now reentrant function is executed
        });

        test('should clear queue without executing', () => {
            const mockFn = jest.fn();

            queue.enqueue(mockFn);
            expect(queue.length).toBe(1);

            queue.clear();

            expect(queue.length).toBe(0);
            expect(mockFn).not.toHaveBeenCalled();
        });

        test('should work without scheduler', () => {
            const queueNoScheduler = new OIMEventQueue();
            const mockFn = jest.fn();

            queueNoScheduler.enqueue(mockFn);
            expect(queueNoScheduler.length).toBe(1);

            queueNoScheduler.flush();
            expect(mockFn).toHaveBeenCalledTimes(1);

            queueNoScheduler.destroy();
        });
    });

    describe('OIMCollectionUpdateEventEmitter', () => {
        let collection: OIMCollection<TOIMTestEntity, string>;
        let coalescer: OIMUpdateEventCoalescerCollection<string>;
        let queue: OIMEventQueue;
        let emitter: OIMUpdateEventEmitter<string>;

        beforeEach(() => {
            collection = new OIMCollection<TOIMTestEntity, string>({
                selectPk: new OIMPkSelectorFactory<
                    TOIMTestEntity,
                    string
                >().createIdSelector(),
                store: new OIMCollectionStoreMapDriven<
                    TOIMTestEntity,
                    string
                >(),
                updateEntity:
                    new OIMEntityUpdaterFactory<TOIMTestEntity>().createMergeEntityUpdater(),
            });

            coalescer = new OIMUpdateEventCoalescerCollection(
                collection.emitter
            );
            queue = new OIMEventQueue();
            emitter = new OIMUpdateEventEmitter({
                coalescer,
                queue,
            });
        });

        afterEach(() => {
            emitter.destroy();
            coalescer.destroy();
            queue.destroy();
            collection.emitter.offAll();
        });

        test('should subscribe to PK updates and receive notifications', () => {
            const handler = jest.fn();
            const unsubscribe = emitter.subscribeOnKey('test1', handler);

            const entity: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            collection.upsertOne(entity);

            // Manually flush the queue to trigger handlers
            queue.flush();

            expect(handler).toHaveBeenCalledTimes(1);

            unsubscribe();
        });

        test('should not notify unrelated PK subscribers', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            emitter.subscribeOnKey('test1', handler1);
            emitter.subscribeOnKey('test2', handler2);

            const entity: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            collection.upsertOne(entity);

            queue.flush();

            expect(handler1).toHaveBeenCalledTimes(1);
            expect(handler2).not.toHaveBeenCalled();
        });

        test('should support multiple handlers per PK', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            emitter.subscribeOnKey('test1', handler1);
            emitter.subscribeOnKey('test1', handler2);

            const entity: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            collection.upsertOne(entity);

            queue.flush();

            expect(handler1).toHaveBeenCalledTimes(1);
            expect(handler2).toHaveBeenCalledTimes(1);
        });

        test('should unsubscribe properly', () => {
            const handler = jest.fn();

            emitter.subscribeOnKey('test1', handler);
            emitter.unsubscribeFromKey('test1', handler);

            const entity: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            collection.upsertOne(entity);

            queue.flush();

            expect(handler).not.toHaveBeenCalled();
        });

        test('should subscribe to multiple PKs at once', () => {
            const handler = jest.fn();
            const unsubscribe = emitter.subscribeOnKeys(
                ['test1', 'test2', 'test3'],
                handler
            );

            const entities: TOIMTestEntity[] = [
                { id: 'test1', name: 'Test 1', value: 10 },
                { id: 'test2', name: 'Test 2', value: 20 },
            ];

            collection.upsertMany(entities);
            queue.flush();

            // Handler should be called twice (once for each updated PK)
            expect(handler).toHaveBeenCalledTimes(2);

            unsubscribe();
        });

        test('should handle duplicate subscriptions gracefully', () => {
            const handler = jest.fn();

            // Subscribe to same PK multiple times
            const unsubscribe = emitter.subscribeOnKeys(
                ['test1', 'test1', 'test1'],
                handler
            );

            const entity: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            collection.upsertOne(entity);

            queue.flush();

            // Handler should only be called once despite duplicate subscriptions
            expect(handler).toHaveBeenCalledTimes(1);

            unsubscribe();
        });

        test('should provide performance metrics', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            emitter.subscribeOnKey('test1', handler1);
            emitter.subscribeOnKey('test1', handler2);
            emitter.subscribeOnKey('test2', handler1);

            const metrics = emitter.getMetrics();

            expect(metrics.totalKeys).toBe(2);
            expect(metrics.totalHandlers).toBe(3);
            expect(metrics.averageHandlersPerKey).toBe(1.5);
            expect(metrics.queueLength).toBe(0);
        });

        test('should check for active subscriptions', () => {
            expect(emitter.hasSubscriptions()).toBe(false);

            const handler = jest.fn();
            emitter.subscribeOnKey('test1', handler);

            expect(emitter.hasSubscriptions()).toBe(true);

            emitter.unsubscribeFromKey('test1', handler);

            expect(emitter.hasSubscriptions()).toBe(false);
        });

        test('should get handler count for specific PK', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            expect(emitter.getHandlerCount('test1')).toBe(0);

            emitter.subscribeOnKey('test1', handler1);
            expect(emitter.getHandlerCount('test1')).toBe(1);

            emitter.subscribeOnKey('test1', handler2);
            expect(emitter.getHandlerCount('test1')).toBe(2);

            emitter.unsubscribeFromKey('test1', handler1);
            expect(emitter.getHandlerCount('test1')).toBe(1);
        });

        test('should optimize for small number of updated PKs', () => {
            // Create many handlers for different PKs
            const handlers: jest.Mock[] = [];
            for (let i = 0; i < 100; i++) {
                const handler = jest.fn();
                handlers.push(handler);
                emitter.subscribeOnKey(`test${i}`, handler);
            }

            // Update only one entity
            const entity: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            collection.upsertOne(entity);

            queue.flush();

            // Only the handler for test1 should be called
            expect(handlers[1]).toHaveBeenCalledTimes(1);

            // All other handlers should not be called
            for (let i = 0; i < 100; i++) {
                if (i !== 1) {
                    expect(handlers[i]).not.toHaveBeenCalled();
                }
            }
        });

        test('should optimize for large number of updated PKs', () => {
            // Create a few handlers
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            emitter.subscribeOnKey('test1', handler1);
            emitter.subscribeOnKey('test2', handler2);

            // Update many entities (more than half of subscribed PKs)
            const entities: TOIMTestEntity[] = [];
            for (let i = 1; i <= 10; i++) {
                entities.push({
                    id: `test${i}`,
                    name: `Test ${i}`,
                    value: i * 10,
                });
            }

            collection.upsertMany(entities);
            queue.flush();

            // Both subscribed handlers should be called
            expect(handler1).toHaveBeenCalledTimes(1);
            expect(handler2).toHaveBeenCalledTimes(1);
        });

        test('should handle empty handler sets gracefully', () => {
            const handler = jest.fn();

            emitter.subscribeOnKey('test1', handler);
            emitter.unsubscribeFromKey('test1', handler);

            // This should not cause any issues
            const entity: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            collection.upsertOne(entity);

            expect(() => queue.flush()).not.toThrow();
            expect(handler).not.toHaveBeenCalled();
        });

        test('should early exit when no handlers are registered', () => {
            const entity: TOIMTestEntity = {
                id: 'test1',
                name: 'Test 1',
                value: 10,
            };
            collection.upsertOne(entity);

            // Should not throw even with no handlers
            expect(() => queue.flush()).not.toThrow();
        });
    });
});
