import { OIMIndexManualAsync } from '../src/core/OIMIndexManualAsync';
import { EOIMIndexEventType } from '@oimdb/core';

describe('OIMIndexManualAsync', () => {
    describe('Basic Operations', () => {
        let index: OIMIndexManualAsync<string, number>;

        beforeEach(() => {
            index = new OIMIndexManualAsync<string, number>();
        });

        afterEach(async () => {
            await index.destroy();
        });

        test('should set and get primary keys', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);

            const pks = await index.getPksByKey('category:electronics');
            expect(Array.from(pks)).toEqual([1, 2, 3]);
        });

        test('should handle multiple keys', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.setPks('category:books', [10, 11, 12]);

            expect(Array.from(await index.getPksByKey('category:electronics'))).toEqual([1, 2, 3]);
            expect(Array.from(await index.getPksByKey('category:books'))).toEqual([10, 11, 12]);
            expect(await index.getSize()).toBe(2);
        });

        test('should add primary keys to existing key', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.addPks('category:electronics', [4, 5]);

            const pks = await index.getPksByKey('category:electronics');
            expect(Array.from(pks)).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
            expect(pks.size).toBe(5);
        });

        test('should not add duplicate primary keys', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.addPks('category:electronics', [2, 3, 4]); // 2,3 are duplicates

            const pks = await index.getPksByKey('category:electronics');
            expect(Array.from(pks)).toEqual(expect.arrayContaining([1, 2, 3, 4]));
            expect(pks.size).toBe(4);
        });

        test('should remove primary keys', async () => {
            await index.setPks('category:electronics', [1, 2, 3, 4, 5]);
            await index.removePks('category:electronics', [2, 4]);

            const pks = await index.getPksByKey('category:electronics');
            expect(Array.from(pks)).toEqual(expect.arrayContaining([1, 3, 5]));
            expect(pks.size).toBe(3);
        });

        test('should clean up empty keys after removal', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.removePks('category:electronics', [1, 2, 3]);

            expect(await index.hasKey('category:electronics')).toBe(false);
            expect(await index.getSize()).toBe(0);
        });

        test('should clear specific key', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.setPks('category:books', [10, 11, 12]);

            await index.clear('category:electronics');

            expect(await index.hasKey('category:electronics')).toBe(false);
            expect(await index.hasKey('category:books')).toBe(true);
            expect(await index.getSize()).toBe(1);
        });

        test('should clear all keys', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.setPks('category:books', [10, 11, 12]);

            await index.clear();

            expect(await index.getSize()).toBe(0);
            expect(await index.isEmpty()).toBe(true);
        });

        test('should return empty set for non-existent key', async () => {
            const pks = await index.getPksByKey('non-existent');
            expect(pks.size).toBe(0);
        });

        test('should handle empty operations gracefully', async () => {
            await index.addPks('category:electronics', []);
            await index.removePks('category:electronics', []);

            expect(await index.getSize()).toBe(0);
        });

        test('should get keys by multiple index keys', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.setPks('category:books', [10, 11, 12]);

            const result = await index.getPksByKeys(['category:electronics', 'category:books']);

            expect(result.size).toBe(2);
            expect(Array.from(result.get('category:electronics')!)).toEqual([1, 2, 3]);
            expect(Array.from(result.get('category:books')!)).toEqual([10, 11, 12]);
        });

        test('should get all keys', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.setPks('category:books', [10, 11, 12]);

            const keys = await index.getKeys();
            expect(keys).toHaveLength(2);
            expect(keys).toEqual(expect.arrayContaining(['category:electronics', 'category:books']));
        });

        test('should get key size', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);

            expect(await index.getKeySize('category:electronics')).toBe(3);
            expect(await index.getKeySize('non-existent')).toBe(0);
        });

        test('should provide metrics', async () => {
            await index.setPks('category:electronics', [1, 2, 3]);
            await index.setPks('category:books', [10, 11]);

            const metrics = await index.getMetrics();

            expect(metrics.totalKeys).toBe(2);
            expect(metrics.totalPks).toBe(5);
            expect(metrics.averagePksPerKey).toBe(2.5);
        });

        test('should emit update events', async () => {
            const eventSpy = jest.fn();
            index.emitter.on(EOIMIndexEventType.UPDATE, eventSpy);

            await index.setPks('category:electronics', [1, 2, 3]);

            expect(eventSpy).toHaveBeenCalled();
        });
    });
});

