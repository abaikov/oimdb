import { OIMReactiveIndexManualAsync } from '../src/core/OIMReactiveIndexManualAsync';
import {
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
} from '@oimdb/core';

describe('OIMReactiveIndexManualAsync', () => {
    describe('Reactive Operations', () => {
        let index: OIMReactiveIndexManualAsync<string, number>;
        let queue: OIMEventQueue;

        beforeEach(() => {
            queue = new OIMEventQueue({
                scheduler: new OIMEventQueueSchedulerImmediate(),
            });
            index = new OIMReactiveIndexManualAsync<string, number>(queue);
        });

        afterEach(async () => {
            await index.destroy();
        });

        test('should have updateEventEmitter', () => {
            expect(index.updateEventEmitter).toBeDefined();
        });

        test('should have coalescer', () => {
            expect(index.coalescer).toBeDefined();
        });

        test('should have index', () => {
            expect(index.index).toBeDefined();
        });

        test('should delegate getPksByKey to index', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);

            const pks = await index.getPksByKey('category:electronics');
            expect(Array.from(pks)).toEqual([1, 2, 3]);
        });

        test('should delegate setPks to index', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);

            const pks = await index.getPksByKey('category:electronics');
            expect(Array.from(pks)).toEqual([1, 2, 3]);
        });

        test('should delegate addPks to index', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.addPks('category:electronics', [4, 5]);

            const pks = await index.getPksByKey('category:electronics');
            expect(Array.from(pks)).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
        });

        test('should delegate removePks to index', async () => {
            await index.setPks('category:electronics', [1, 2, 3, 4, 5]);
            await index.removePks('category:electronics', [2, 4]);

            const pks = await index.getPksByKey('category:electronics');
            expect(Array.from(pks)).toEqual(expect.arrayContaining([1, 3, 5]));
        });

        test('should delegate clear to index', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.clear('category:electronics');

            expect(await index.hasKey('category:electronics')).toBe(false);
        });

        test('should subscribe to key-specific updates', async () => {
            const callback = jest.fn();

            index.updateEventEmitter.subscribeOnKey('category:electronics', callback);

            await index.setPks('category:electronics', [1, 2, 3]);

            // Wait for event processing
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callback).toHaveBeenCalled();
        });

        test('should provide metrics', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.setPks('category:books', [10, 11]);

            const metrics = await index.getMetrics();

            expect(metrics.totalKeys).toBe(2);
            expect(metrics.totalPks).toBe(5);
        });
    });
});

