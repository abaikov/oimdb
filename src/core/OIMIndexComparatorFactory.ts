import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';

/**
 * Factory for creating index comparators.
 * Provides common comparison strategies for primary key arrays.
 */
export class OIMIndexComparatorFactory {
    /**
     * Create an element-wise comparator that checks arrays for strict equality.
     * Compares array lengths and each element using strict equality (===).
     */
    static createElementWiseComparator<
        TPk extends TOIMPk,
    >(): TOIMIndexComparator<TPk> {
        return (
            existingPks: readonly TPk[],
            newPks: readonly TPk[]
        ): boolean => {
            // Quick length check
            if (existingPks.length !== newPks.length) {
                return false;
            }

            // Element-wise comparison using strict equality
            for (let i = 0; i < existingPks.length; i++) {
                if (existingPks[i] !== newPks[i]) {
                    return false;
                }
            }

            return true; // Arrays are equal
        };
    }

    /**
     * Create a set-based comparator that checks if arrays contain the same elements.
     * Order doesn't matter, only the presence of elements.
     */
    static createSetBasedComparator<
        TPk extends TOIMPk,
    >(): TOIMIndexComparator<TPk> {
        return (
            existingPks: readonly TPk[],
            newPks: readonly TPk[]
        ): boolean => {
            // Quick length check
            if (existingPks.length !== newPks.length) {
                return false;
            }

            // Convert to sets for comparison
            const existingSet = new Set(existingPks);
            const newSet = new Set(newPks);

            // Check if sets have same size (no duplicates issue)
            if (
                existingSet.size !== newSet.size ||
                existingSet.size !== existingPks.length
            ) {
                return false;
            }

            // Check if all elements from existing set are in new set
            for (const pk of existingSet) {
                if (!newSet.has(pk)) {
                    return false;
                }
            }

            return true; // Sets contain same elements
        };
    }

    /**
     * Create a shallow comparator that only checks array references.
     * Fastest but only works if you're reusing the same array instances.
     */
    static createShallowComparator<
        TPk extends TOIMPk,
    >(): TOIMIndexComparator<TPk> {
        return (
            existingPks: readonly TPk[],
            newPks: readonly TPk[]
        ): boolean => {
            return existingPks === newPks;
        };
    }

    /**
     * Create a no-comparison comparator that always returns false (always updates).
     * Useful for disabling comparison while keeping the same interface.
     */
    static createAlwaysUpdateComparator<
        TPk extends TOIMPk,
    >(): TOIMIndexComparator<TPk> {
        return (): boolean => false;
    }
}
