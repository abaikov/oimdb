import { OIMEventEmitter } from '../core/OIMEventEmitter';
import { EOIMIndexEventType } from '../enum/EOIMIndexEventType';
import { TOIMIndexUpdatePayload } from '../types/TOIMIndexUpdatePayload';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { OIMIndexStoreArrayBased } from './OIMIndexStoreArrayBased';
import { OIMIndexStoreMapDrivenArrayBased } from '../core/OIMIndexStoreMapDrivenArrayBased';

/**
 * Abstract base class for Array-based index types.
 * Provides common functionality and event system for key-to-PKs mappings using Array storage.
 */
export abstract class OIMIndexArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    protected readonly comparePks?: TOIMIndexComparator<TPk>;
    protected readonly store: OIMIndexStoreArrayBased<TKey, TPk>;
    public readonly emitter = new OIMEventEmitter<{
        [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TKey>;
    }>();

    constructor(
        options: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreArrayBased<TKey, TPk>;
        } = {}
    ) {
        this.comparePks = options.comparePks;
        this.store =
            options.store ?? new OIMIndexStoreMapDrivenArrayBased<TKey, TPk>();
    }

    /**
     * Get primary keys for multiple index keys
     */
    public getPksByKeys(keys: readonly TKey[]): Map<TKey, TPk[]> {
        return this.store.getManyByKeys(keys);
    }

    /**
     * Get primary keys for a specific index key
     */
    public getPksByKey(key: TKey): TPk[] {
        const pksArray = this.store.getOneByKey(key);
        return pksArray ? pksArray : [];
    }

    /**
     * Check if an index key exists
     */
    public hasKey(key: TKey): boolean {
        return this.store.getOneByKey(key) !== undefined;
    }

    /**
     * Get all index keys
     */
    public getKeys(): readonly TKey[] {
        return this.store.getAllKeys();
    }

    /**
     * Get the number of primary keys for a specific index key
     */
    public getKeySize(key: TKey): number {
        const pksArray = this.store.getOneByKey(key);
        return pksArray ? pksArray.length : 0;
    }

    /**
     * Get total number of index keys
     */
    public get size(): number {
        return this.store.countAll();
    }

    /**
     * Check if the index is empty
     */
    public get isEmpty(): boolean {
        return this.store.countAll() === 0;
    }

    /**
     * Get performance metrics for monitoring and debugging
     */
    public getMetrics() {
        let totalPks = 0;
        let maxBucketSize = 0;
        let minBucketSize = Infinity;
        const allPks = this.store.getAll();

        for (const pksArray of allPks.values()) {
            totalPks += pksArray.length;
            maxBucketSize = Math.max(maxBucketSize, pksArray.length);
            minBucketSize = Math.min(minBucketSize, pksArray.length);
        }

        return {
            totalKeys: allPks.size,
            totalPks,
            averagePksPerKey: allPks.size > 0 ? totalPks / allPks.size : 0,
            maxBucketSize: maxBucketSize === -Infinity ? 0 : maxBucketSize,
            minBucketSize: minBucketSize === Infinity ? 0 : minBucketSize,
        };
    }

    /**
     * Clean up event listeners when index is no longer needed
     */
    public destroy(): void {
        this.emitter.offAll();
        this.store.clear();
    }

    /**
     * Set primary keys for a specific index key with optional comparison.
     * If comparator is provided and returns true (no changes), skip the update.
     */
    protected setPksWithComparison(key: TKey, newPks: TPk[]): boolean {
        // If comparator is provided, check if arrays are equal
        if (this.comparePks) {
            const existingPksArray = this.store.getOneByKey(key);
            // Quick size check before expensive comparison
            if (existingPksArray && existingPksArray.length === newPks.length) {
                if (this.comparePks(existingPksArray, newPks)) {
                    return false;
                }
            } else if (!existingPksArray && newPks.length === 0) {
                // Both are empty
                return false;
            }
        }

        // Update the PKs
        this.store.setOneByKey(key, newPks);
        return true;
    }

    /**
     * Emit update event with changed keys
     */
    protected emitUpdate(keys: TKey[]): void {
        this.emitter.emit(EOIMIndexEventType.UPDATE, { keys });
    }
}
