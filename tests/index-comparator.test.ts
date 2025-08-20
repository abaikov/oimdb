import { OIMIndexComparatorFactory } from '../src/core/OIMIndexComparatorFactory';

describe('OIMIndexComparatorFactory', () => {
    describe('Element-wise Comparator', () => {
        const comparator =
            OIMIndexComparatorFactory.createElementWiseComparator<number>();

        test('should return true for identical arrays', () => {
            expect(comparator([1, 2, 3], [1, 2, 3])).toBe(true);
            expect(comparator([], [])).toBe(true);
            expect(comparator([42], [42])).toBe(true);
        });

        test('should return false for arrays with different elements', () => {
            expect(comparator([1, 2, 3], [1, 2, 4])).toBe(false);
            expect(comparator([1, 2, 3], [4, 5, 6])).toBe(false);
        });

        test('should return false for arrays with different lengths', () => {
            expect(comparator([1, 2, 3], [1, 2])).toBe(false);
            expect(comparator([1, 2], [1, 2, 3])).toBe(false);
            expect(comparator([], [1])).toBe(false);
        });

        test('should return false for arrays with same elements in different order', () => {
            expect(comparator([1, 2, 3], [3, 2, 1])).toBe(false);
            expect(comparator([1, 2, 3], [2, 1, 3])).toBe(false);
        });

        test('should handle string PKs', () => {
            const stringComparator =
                OIMIndexComparatorFactory.createElementWiseComparator<string>();

            expect(stringComparator(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(
                true
            );
            expect(stringComparator(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(
                false
            );
        });
    });

    describe('Set-based Comparator', () => {
        const comparator =
            OIMIndexComparatorFactory.createSetBasedComparator<number>();

        test('should return true for arrays with same elements regardless of order', () => {
            expect(comparator([1, 2, 3], [1, 2, 3])).toBe(true);
            expect(comparator([1, 2, 3], [3, 2, 1])).toBe(true);
            expect(comparator([1, 2, 3], [2, 1, 3])).toBe(true);
            expect(comparator([], [])).toBe(true);
        });

        test('should return false for arrays with different elements', () => {
            expect(comparator([1, 2, 3], [1, 2, 4])).toBe(false);
            expect(comparator([1, 2, 3], [4, 5, 6])).toBe(false);
        });

        test('should return false for arrays with different lengths', () => {
            expect(comparator([1, 2, 3], [1, 2])).toBe(false);
            expect(comparator([1, 2], [1, 2, 3])).toBe(false);
        });

        test('should handle arrays with duplicates correctly', () => {
            // Arrays with duplicates should be treated as having different effective lengths
            expect(comparator([1, 2, 2, 3], [1, 2, 3])).toBe(false);
            expect(comparator([1, 2, 3], [1, 2, 2, 3])).toBe(false);
        });

        test('should handle string PKs', () => {
            const stringComparator =
                OIMIndexComparatorFactory.createSetBasedComparator<string>();

            expect(stringComparator(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(
                true
            );
            expect(stringComparator(['a', 'b', 'c'], ['a', 'b', 'd'])).toBe(
                false
            );
        });
    });

    describe('Shallow Comparator', () => {
        const comparator =
            OIMIndexComparatorFactory.createShallowComparator<number>();

        test('should return true only for same reference', () => {
            const arr1 = [1, 2, 3];
            const arr2 = [1, 2, 3];

            expect(comparator(arr1, arr1)).toBe(true); // Same reference
            expect(comparator(arr1, arr2)).toBe(false); // Different reference, same content
        });

        test('should work with empty arrays', () => {
            const empty1: number[] = [];
            const empty2: number[] = [];

            expect(comparator(empty1, empty1)).toBe(true);
            expect(comparator(empty1, empty2)).toBe(false);
        });
    });

    describe('Always Update Comparator', () => {
        const comparator =
            OIMIndexComparatorFactory.createAlwaysUpdateComparator<number>();

        test('should always return false', () => {
            expect(comparator([1, 2, 3], [1, 2, 3])).toBe(false);
            expect(comparator([1, 2, 3], [4, 5, 6])).toBe(false);
            expect(comparator([], [])).toBe(false);
        });
    });

    describe('Performance Characteristics', () => {
        test('element-wise comparator should be fast for small arrays', () => {
            const comparator =
                OIMIndexComparatorFactory.createElementWiseComparator<number>();
            const arr1 = [1, 2, 3, 4, 5];
            const arr2 = [1, 2, 3, 4, 5];

            const start = performance.now();
            for (let i = 0; i < 10000; i++) {
                comparator(arr1, arr2);
            }
            const end = performance.now();

            expect(end - start).toBeLessThan(100); // Should complete in less than 100ms
        });

        test('set-based comparator should handle larger arrays efficiently', () => {
            const comparator =
                OIMIndexComparatorFactory.createSetBasedComparator<number>();
            const arr1 = Array.from({ length: 1000 }, (_, i) => i);
            const arr2 = Array.from({ length: 1000 }, (_, i) => 999 - i); // Reverse order

            const start = performance.now();
            const result = comparator(arr1, arr2);
            const end = performance.now();

            expect(result).toBe(true); // Same elements
            expect(end - start).toBeLessThan(50); // Should be reasonably fast
        });

        test('shallow comparator should be fastest', () => {
            const comparator =
                OIMIndexComparatorFactory.createShallowComparator<number>();
            const arr1 = Array.from({ length: 10000 }, (_, i) => i);

            const start = performance.now();
            for (let i = 0; i < 100000; i++) {
                comparator(arr1, arr1);
            }
            const end = performance.now();

            expect(end - start).toBeLessThan(50); // Should be very fast
        });
    });
});
