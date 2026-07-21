import { TOIMKey } from '@oimdb/core';

/**
 * Result of finding updated entities between two records
 */
export type TOIMDBReduxUpdatedEntitiesResult<TKey extends PropertyKey> = {
    /** Keys added (present in newEntities but not in oldEntities). */
    added: Set<TKey>;
    /** Keys updated (present in both but with a different value reference). */
    updated: Set<TKey>;
    /** Keys removed (present in oldEntities but not in newEntities). */
    removed: Set<TKey>;
    /** Combined set of all changed keys. */
    all: Set<TKey>;
};

/**
 * Result of finding updated items in arrays
 */
export type TOIMDBReduxUpdatedArrayResult<TPk extends TOIMKey> = {
    /**
     * Array of primary keys that were added (present in newArray but not in oldArray)
     */
    added: TPk[];

    /**
     * Array of primary keys that were updated (present in both but with different values)
     */
    updated: TPk[];

    /**
     * Array of primary keys that were removed (present in oldArray but not in newArray)
     */
    removed: TPk[];

    /**
     * Combined array of all changed keys (added + updated + removed)
     */
    all: TPk[];
};

/**
 * Find differences between two entity records (dictionaries)
 * Compares entities by reference (shallow comparison)
 *
 * @param oldEntities - Previous state of entities as Record
 * @param newEntities - New state of entities as Record
 * @returns Object with sets of added, updated, removed, and all changed keys
 *
 * @example
 * ```typescript
 * const oldEntities = { '1': { id: '1', name: 'Alice' }, '2': { id: '2', name: 'Bob' } };
 * const newEntities = { '1': { id: '1', name: 'Alice Updated' }, '3': { id: '3', name: 'Charlie' } };
 * const result = findUpdatedInRecord(oldEntities, newEntities);
 * // result.added = Set(['3'])
 * // result.updated = Set(['1'])
 * // result.removed = Set(['2'])
 * // result.all = Set(['1', '2', '3'])
 * ```
 */
export function findUpdatedInRecord<
    TEntity extends object,
    TKey extends PropertyKey,
>(
    oldEntities: Record<TKey, TEntity>,
    newEntities: Record<TKey, TEntity>
): TOIMDBReduxUpdatedEntitiesResult<TKey> {
    const added = new Set<TKey>();
    const updated = new Set<TKey>();
    const removed = new Set<TKey>();

    // `for..in` yields the record's string keys.
    for (const pk in newEntities) {
        if (Object.prototype.hasOwnProperty.call(newEntities, pk)) {
            const key = pk as TKey;
            if (!(key in oldEntities)) {
                added.add(key);
            } else if (oldEntities[key] !== newEntities[key]) {
                updated.add(key);
            }
        }
    }

    for (const pk in oldEntities) {
        if (Object.prototype.hasOwnProperty.call(oldEntities, pk)) {
            const key = pk as TKey;
            if (!(key in newEntities)) {
                removed.add(key);
            }
        }
    }

    // Combine all changes
    const all = new Set<TKey>();
    const addedArray = Array.from(added);
    const updatedArray = Array.from(updated);
    const removedArray = Array.from(removed);
    const addedLength = addedArray.length;
    const updatedLength = updatedArray.length;
    const removedLength = removedArray.length;

    for (let i = 0; i < addedLength; i++) {
        all.add(addedArray[i]);
    }
    for (let i = 0; i < updatedLength; i++) {
        all.add(updatedArray[i]);
    }
    for (let i = 0; i < removedLength; i++) {
        all.add(removedArray[i]);
    }

    return { added, updated, removed, all };
}

/**
 * Find differences between two arrays of primary keys
 * Compares arrays to find added, removed, and common items
 *
 * @param oldArray - Previous array of primary keys
 * @param newArray - New array of primary keys
 * @returns Object with arrays of added, updated (common), removed, and all changed keys
 *
 * @example
 * ```typescript
 * const oldArray = ['1', '2', '3'];
 * const newArray = ['1', '3', '4'];
 * const result = findUpdatedInArray(oldArray, newArray);
 * // result.added = ['4']
 * // result.updated = ['1', '3'] (common items)
 * // result.removed = ['2']
 * // result.all = ['1', '2', '3', '4']
 * ```
 */
export function findUpdatedInArray<TPk extends TOIMKey>(
    oldArray: readonly TPk[],
    newArray: readonly TPk[]
): TOIMDBReduxUpdatedArrayResult<TPk> {
    const oldSet = new Set(oldArray);
    const newSet = new Set(newArray);
    const oldLength = oldArray.length;
    const newLength = newArray.length;

    const added: TPk[] = [];
    const updated: TPk[] = [];
    const removed: TPk[] = [];

    // Find added items (in newArray but not in oldArray)
    for (let i = 0; i < newLength; i++) {
        const pk = newArray[i];
        if (!oldSet.has(pk)) {
            added.push(pk);
        } else {
            updated.push(pk);
        }
    }

    // Find removed items (in oldArray but not in newArray)
    for (let i = 0; i < oldLength; i++) {
        const pk = oldArray[i];
        if (!newSet.has(pk)) {
            removed.push(pk);
        }
    }

    // Combine all changes
    const allLength = added.length + updated.length + removed.length;
    const all: TPk[] = [];
    all.length = allLength;

    let writeIndex = 0;
    for (let i = 0; i < added.length; i++) {
        all[writeIndex++] = added[i];
    }
    for (let i = 0; i < updated.length; i++) {
        all[writeIndex++] = updated[i];
    }
    for (let i = 0; i < removed.length; i++) {
        all[writeIndex++] = removed[i];
    }
    all.length = writeIndex; // Trim to actual size

    return { added, updated, removed, all };
}
