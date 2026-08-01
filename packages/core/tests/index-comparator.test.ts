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

    describe('Cost characteristics', () => {
        // Asserted by BEHAVIOUR, not by the clock. Wall-clock thresholds here were
        // environment-dependent by construction — they failed outright under coverage
        // instrumentation and would fail at random on a loaded CI machine.

        /** Counts how many elements a comparator actually reads. */
        const counting = <T>(items: readonly T[]) => {
            let reads = 0;
            const proxy = new Proxy(items, {
                get(target, prop, receiver) {
                    if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++;
                    return Reflect.get(target, prop, receiver);
                },
            });
            return { proxy: proxy as readonly T[], reads: () => reads };
        };

        test('shallow compares by reference and reads no elements at all', () => {
            const comparator =
                OIMIndexComparatorFactory.createShallowComparator<number>();
            const { proxy, reads } = counting(
                Array.from({ length: 10_000 }, (_, i) => i)
            );

            expect(comparator(proxy, proxy)).toBe(true);
            expect(reads()).toBe(0); // this is what makes it the cheap one

            const other = Array.from({ length: 10_000 }, (_, i) => i);
            expect(comparator(proxy, other)).toBe(false); // equal content, different identity
            expect(reads()).toBe(0);
        });

        test('element-wise stops at the first difference instead of scanning on', () => {
            const comparator =
                OIMIndexComparatorFactory.createElementWiseComparator<number>();
            const a = Array.from({ length: 1000 }, (_, i) => i);
            const b = [...a];
            b[1] = -1;
            const { proxy, reads } = counting(a);

            expect(comparator(proxy, b)).toBe(false);
            expect(reads()).toBeLessThan(10); // bailed early, did not walk 1000 elements
        });

        test('a length mismatch short-circuits before any element is read', () => {
            const elementWise =
                OIMIndexComparatorFactory.createElementWiseComparator<number>();
            const setBased =
                OIMIndexComparatorFactory.createSetBasedComparator<number>();
            const { proxy, reads } = counting([1, 2, 3]);

            expect(elementWise(proxy, [1, 2])).toBe(false);
            expect(setBased(proxy, [1, 2])).toBe(false);
            expect(reads()).toBe(0);
        });

        test('set-based ignores order where element-wise does not', () => {
            const setBased =
                OIMIndexComparatorFactory.createSetBasedComparator<number>();
            const elementWise =
                OIMIndexComparatorFactory.createElementWiseComparator<number>();
            const ascending = Array.from({ length: 1000 }, (_, i) => i);
            const descending = [...ascending].reverse();

            expect(setBased(ascending, descending)).toBe(true);
            expect(elementWise(ascending, descending)).toBe(false);
        });
    });
});
