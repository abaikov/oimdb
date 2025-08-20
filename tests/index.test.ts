import { OIMIndexManual } from '../src/core/OIMIndexManual';
import { OIMIndexComparatorFactory } from '../src/core/OIMIndexComparatorFactory';
import { OIMUpdateEventCoalescerIndex } from '../src/core/OIMUpdateEventCoalescerIndex';
import { OIMUpdateEventEmitter } from '../src/core/OIMUpdateEventEmitter';
import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMEventQueueSchedulerImmediate } from '../src/core/event-queue-scheduler/OIMEventQueueSchedulerImmediate';
import { EOIMIndexEventType } from '../src/enum/EOIMIndexEventType';
import { TOIMIndexUpdatePayload } from '../src/types/TOIMIndexUpdatePayload';

describe('OIMIndexManual', () => {
    describe('Basic Operations', () => {
        let index: OIMIndexManual<string, number>;

        beforeEach(() => {
            index = new OIMIndexManual<string, number>();
        });

        afterEach(() => {
            index.destroy();
        });

        test('should set and get primary keys', () => {
            index.setPks('category:electronics', [1, 2, 3]);

            const pks = index.getPks('category:electronics');
            expect(pks).toEqual([1, 2, 3]);
        });

        test('should handle multiple keys', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            index.setPks('category:books', [10, 11, 12]);

            expect(index.getPks('category:electronics')).toEqual([1, 2, 3]);
            expect(index.getPks('category:books')).toEqual([10, 11, 12]);
            expect(index.size).toBe(2);
        });

        test('should add primary keys to existing key', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            index.addPks('category:electronics', [4, 5]);

            const pks = index.getPks('category:electronics');
            expect(pks).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
            expect(pks.length).toBe(5);
        });

        test('should not add duplicate primary keys', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            index.addPks('category:electronics', [2, 3, 4]); // 2,3 are duplicates

            const pks = index.getPks('category:electronics');
            expect(pks).toEqual(expect.arrayContaining([1, 2, 3, 4]));
            expect(pks.length).toBe(4);
        });

        test('should remove primary keys', () => {
            index.setPks('category:electronics', [1, 2, 3, 4, 5]);
            index.removePks('category:electronics', [2, 4]);

            const pks = index.getPks('category:electronics');
            expect(pks).toEqual(expect.arrayContaining([1, 3, 5]));
            expect(pks.length).toBe(3);
        });

        test('should clean up empty keys after removal', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            index.removePks('category:electronics', [1, 2, 3]);

            expect(index.hasKey('category:electronics')).toBe(false);
            expect(index.size).toBe(0);
        });

        test('should clear specific key', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            index.setPks('category:books', [10, 11, 12]);

            index.clear('category:electronics');

            expect(index.hasKey('category:electronics')).toBe(false);
            expect(index.hasKey('category:books')).toBe(true);
            expect(index.size).toBe(1);
        });

        test('should clear all keys', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            index.setPks('category:books', [10, 11, 12]);

            index.clear();

            expect(index.size).toBe(0);
            expect(index.isEmpty).toBe(true);
        });

        test('should return empty array for non-existent key', () => {
            const pks = index.getPks('non-existent');
            expect(pks).toEqual([]);
        });

        test('should handle empty operations gracefully', () => {
            index.addPks('category:electronics', []); // Empty add
            index.removePks('category:electronics', []); // Empty remove

            expect(index.size).toBe(0);
        });
    });

    describe('Event System', () => {
        let index: OIMIndexManual<string, number>;
        let eventSpy: jest.Mock;

        beforeEach(() => {
            index = new OIMIndexManual<string, number>();
            eventSpy = jest.fn();
            index.emitter.on(EOIMIndexEventType.UPDATE, eventSpy);
        });

        afterEach(() => {
            index.emitter.offAll();
            index.destroy();
        });

        test('should emit update event when setting PKs', () => {
            index.setPks('category:electronics', [1, 2, 3]);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                keys: ['category:electronics'],
            } as TOIMIndexUpdatePayload<string>);
        });

        test('should emit update event when adding PKs', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            eventSpy.mockClear();

            index.addPks('category:electronics', [4, 5]);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                keys: ['category:electronics'],
            });
        });

        test('should not emit event when adding duplicate PKs', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            eventSpy.mockClear();

            index.addPks('category:electronics', [2, 3]); // All duplicates

            expect(eventSpy).not.toHaveBeenCalled();
        });

        test('should emit update event when removing PKs', () => {
            index.setPks('category:electronics', [1, 2, 3, 4, 5]);
            eventSpy.mockClear();

            index.removePks('category:electronics', [2, 4]);

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                keys: ['category:electronics'],
            });
        });

        test('should not emit event when removing non-existent PKs', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            eventSpy.mockClear();

            index.removePks('category:electronics', [10, 11]); // Non-existent

            expect(eventSpy).not.toHaveBeenCalled();
        });

        test('should emit update event when clearing key', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            eventSpy.mockClear();

            index.clear('category:electronics');

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                keys: ['category:electronics'],
            });
        });

        test('should emit multiple events when clearing all', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            index.setPks('category:books', [10, 11, 12]);
            eventSpy.mockClear();

            index.clear();

            expect(eventSpy).toHaveBeenCalledTimes(1);
            expect(eventSpy).toHaveBeenCalledWith({
                keys: expect.arrayContaining([
                    'category:electronics',
                    'category:books',
                ]),
            });
        });
    });

    describe('Comparators', () => {
        describe('Element-wise Comparator', () => {
            let index: OIMIndexManual<string, number>;
            let eventSpy: jest.Mock;

            beforeEach(() => {
                index = new OIMIndexManual<string, number>({
                    comparePks:
                        OIMIndexComparatorFactory.createElementWiseComparator<number>(),
                });
                eventSpy = jest.fn();
                index.emitter.on(EOIMIndexEventType.UPDATE, eventSpy);
            });

            afterEach(() => {
                index.emitter.offAll();
                index.destroy();
            });

            test('should skip update when setting identical arrays', () => {
                index.setPks('test', [1, 2, 3]);
                eventSpy.mockClear();

                index.setPks('test', [1, 2, 3]); // Identical

                expect(eventSpy).not.toHaveBeenCalled();
                expect(index.getPks('test')).toEqual([1, 2, 3]);
            });

            test('should update when arrays differ by content', () => {
                index.setPks('test', [1, 2, 3]);
                eventSpy.mockClear();

                index.setPks('test', [1, 2, 4]); // Different content

                expect(eventSpy).toHaveBeenCalledTimes(1);
                expect(index.getPks('test')).toEqual([1, 2, 4]);
            });

            test('should update when arrays differ by order', () => {
                index.setPks('test', [1, 2, 3]);
                eventSpy.mockClear();

                index.setPks('test', [3, 2, 1]); // Different order

                expect(eventSpy).toHaveBeenCalledTimes(1);
                expect(index.getPks('test')).toEqual([3, 2, 1]);
            });

            test('should update when arrays differ by length', () => {
                index.setPks('test', [1, 2, 3]);
                eventSpy.mockClear();

                index.setPks('test', [1, 2, 3, 4]); // Different length

                expect(eventSpy).toHaveBeenCalledTimes(1);
                expect(index.getPks('test')).toEqual([1, 2, 3, 4]);
            });
        });

        describe('Set-based Comparator', () => {
            let index: OIMIndexManual<string, number>;
            let eventSpy: jest.Mock;

            beforeEach(() => {
                index = new OIMIndexManual<string, number>({
                    comparePks:
                        OIMIndexComparatorFactory.createSetBasedComparator<number>(),
                });
                eventSpy = jest.fn();
                index.emitter.on(EOIMIndexEventType.UPDATE, eventSpy);
            });

            afterEach(() => {
                index.emitter.offAll();
                index.destroy();
            });

            test('should skip update when setting arrays with same elements in different order', () => {
                index.setPks('test', [1, 2, 3]);
                eventSpy.mockClear();

                index.setPks('test', [3, 1, 2]); // Same elements, different order

                expect(eventSpy).not.toHaveBeenCalled();
                // Note: actual storage order might change, but logically it's the same set
            });

            test('should update when arrays have different elements', () => {
                index.setPks('test', [1, 2, 3]);
                eventSpy.mockClear();

                index.setPks('test', [1, 2, 4]); // Different elements

                expect(eventSpy).toHaveBeenCalledTimes(1);
            });

            test('should update when arrays have different lengths', () => {
                index.setPks('test', [1, 2, 3]);
                eventSpy.mockClear();

                index.setPks('test', [1, 2]); // Shorter array

                expect(eventSpy).toHaveBeenCalledTimes(1);
            });
        });

        describe('No Comparator', () => {
            let index: OIMIndexManual<string, number>;
            let eventSpy: jest.Mock;

            beforeEach(() => {
                index = new OIMIndexManual<string, number>(); // No comparator
                eventSpy = jest.fn();
                index.emitter.on(EOIMIndexEventType.UPDATE, eventSpy);
            });

            afterEach(() => {
                index.emitter.offAll();
                index.destroy();
            });

            test('should always emit update events', () => {
                index.setPks('test', [1, 2, 3]);
                index.setPks('test', [1, 2, 3]); // Identical data
                index.setPks('test', [1, 2, 3]); // Identical data again

                expect(eventSpy).toHaveBeenCalledTimes(3); // All updates emitted
            });
        });
    });

    describe('Metrics and Utilities', () => {
        let index: OIMIndexManual<string, number>;

        beforeEach(() => {
            index = new OIMIndexManual<string, number>();
        });

        afterEach(() => {
            index.destroy();
        });

        test('should provide accurate metrics', () => {
            index.setPks('category:electronics', [1, 2, 3, 4, 5]);
            index.setPks('category:books', [10, 11]);
            index.setPks('category:clothing', [20, 21, 22, 23]);

            const metrics = index.getMetrics();

            expect(metrics.totalKeys).toBe(3);
            expect(metrics.totalPks).toBe(11); // 5 + 2 + 4
            expect(metrics.averagePksPerKey).toBeCloseTo(3.67, 2); // 11/3 = 3.67
            expect(metrics.maxBucketSize).toBe(5);
            expect(metrics.minBucketSize).toBe(2);
        });

        test('should report empty metrics for empty index', () => {
            const metrics = index.getMetrics();

            expect(metrics.totalKeys).toBe(0);
            expect(metrics.totalPks).toBe(0);
            expect(metrics.averagePksPerKey).toBe(0);
            expect(metrics.maxBucketSize).toBe(0);
            expect(metrics.minBucketSize).toBe(0);
        });

        test('should get all keys', () => {
            index.setPks('category:electronics', [1, 2, 3]);
            index.setPks('category:books', [10, 11, 12]);

            const keys = index.getKeys();
            expect(keys).toEqual(
                expect.arrayContaining([
                    'category:electronics',
                    'category:books',
                ])
            );
            expect(keys.length).toBe(2);
        });

        test('should get key size correctly', () => {
            index.setPks('category:electronics', [1, 2, 3, 4, 5]);

            expect(index.getKeySize('category:electronics')).toBe(5);
            expect(index.getKeySize('non-existent')).toBe(0);
        });

        test('should check key existence', () => {
            index.setPks('category:electronics', [1, 2, 3]);

            expect(index.hasKey('category:electronics')).toBe(true);
            expect(index.hasKey('non-existent')).toBe(false);
        });

        test('should report empty state correctly', () => {
            expect(index.isEmpty).toBe(true);

            index.setPks('test', [1]);
            expect(index.isEmpty).toBe(false);

            index.clear();
            expect(index.isEmpty).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        let index: OIMIndexManual<string, number>;

        beforeEach(() => {
            index = new OIMIndexManual<string, number>();
        });

        afterEach(() => {
            index.destroy();
        });

        test('should handle empty arrays', () => {
            index.setPks('test', []);

            expect(index.getPks('test')).toEqual([]);
            expect(index.hasKey('test')).toBe(true);
            expect(index.getKeySize('test')).toBe(0);
        });

        test('should handle operations on non-existent keys', () => {
            expect(() =>
                index.removePks('non-existent', [1, 2, 3])
            ).not.toThrow();
            expect(() => index.clear('non-existent')).not.toThrow();
        });

        test('should handle large datasets', () => {
            const largePks = Array.from({ length: 10000 }, (_, i) => i);

            index.setPks('large-dataset', largePks);

            expect(index.getKeySize('large-dataset')).toBe(10000);
            expect(index.getPks('large-dataset')).toEqual(largePks);
        });

        test('should handle string PKs', () => {
            const stringIndex = new OIMIndexManual<string, string>();

            stringIndex.setPks('users:active', ['user1', 'user2', 'user3']);
            stringIndex.addPks('users:active', ['user4', 'user5']);

            const pks = stringIndex.getPks('users:active');
            expect(pks).toEqual(
                expect.arrayContaining([
                    'user1',
                    'user2',
                    'user3',
                    'user4',
                    'user5',
                ])
            );
            expect(pks.length).toBe(5);

            stringIndex.destroy();
        });
    });

    describe('Event System Integration', () => {
        let index: OIMIndexManual<string, number>;
        let coalescer: OIMUpdateEventCoalescerIndex<string>;
        let emitter: OIMUpdateEventEmitter<string>;
        let queue: OIMEventQueue;
        let scheduler: OIMEventQueueSchedulerImmediate;

        beforeEach(() => {
            index = new OIMIndexManual<string, number>();
            coalescer = new OIMUpdateEventCoalescerIndex(index.emitter);
            scheduler = new OIMEventQueueSchedulerImmediate();
            queue = new OIMEventQueue({ scheduler });
            emitter = new OIMUpdateEventEmitter({ coalescer, queue });
        });

        afterEach(() => {
            emitter.destroy();
            coalescer.destroy();
            queue.destroy();
            index.destroy();
        });

        test('should notify subscribers on index changes', () => {
            const handler = jest.fn();
            emitter.subscribeOnKey('category:electronics', handler);

            index.setPks('category:electronics', [1, 2, 3]);
            // Immediate scheduler processes automatically, but we can still flush manually
            queue.flush();

            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('should support multiple subscribers per key', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            emitter.subscribeOnKey('category:electronics', handler1);
            emitter.subscribeOnKey('category:electronics', handler2);

            index.setPks('category:electronics', [1, 2, 3]);
            // Immediate scheduler processes automatically, but we can still flush manually
            queue.flush();

            expect(handler1).toHaveBeenCalledTimes(1);
            expect(handler2).toHaveBeenCalledTimes(1);
        });

        test('should coalesce multiple rapid updates', () => {
            const handler = jest.fn();
            emitter.subscribeOnKey('category:electronics', handler);

            // Multiple rapid updates before processing
            index.setPks('category:electronics', [1, 2, 3]);
            index.addPks('category:electronics', [4, 5]);
            index.removePks('category:electronics', [1]);

            // Process all at once
            // Immediate scheduler processes automatically, but we can still flush manually
            queue.flush();

            // Should only receive one notification despite multiple updates
            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('should handle subscriptions to multiple keys', () => {
            const handler = jest.fn();
            emitter.subscribeOnKeys(
                ['category:electronics', 'category:books'],
                handler
            );

            index.setPks('category:electronics', [1, 2, 3]);
            index.setPks('category:books', [10, 11, 12]);

            // Immediate scheduler processes automatically, but we can still flush manually
            queue.flush();

            // Should receive notifications for both keys
            expect(handler).toHaveBeenCalledTimes(2);
        });
    });
});
