import { TOIMPk } from '@oimdb/core';

/**
 * Check if two arrays are equal by comparing their elements.
 * Uses strict equality (===) for comparison.
 * Order matters - arrays with same elements in different order are considered different.
 *
 * @param a - First array
 * @param b - Second array
 * @returns true if arrays have same length and all elements are equal, false otherwise
 *
 * @example
 * ```typescript
 * arraysEqual([1, 2, 3], [1, 2, 3]); // true
 * arraysEqual([1, 2, 3], [1, 2]); // false
 * arraysEqual([1, 2, 3], [1, 3, 2]); // false (order matters)
 * arraysEqual([], []); // true
 * ```
 */
export function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Check if two arrays of primary keys are equal (same elements in same order).
 * Optimized version for TOIMPk arrays.
 *
 * @param a - First array of primary keys
 * @param b - Second array of primary keys
 * @returns true if arrays are equal, false otherwise
 */
export function arraysEqualPk<TPk extends TOIMPk>(
    a: readonly TPk[],
    b: readonly TPk[]
): boolean {
    return arraysEqual(a, b);
}

