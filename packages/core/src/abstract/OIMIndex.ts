import { OIMEventEmitter } from '../core/OIMEventEmitter';
import { EOIMIndexEventType } from '../enum/EOIMIndexEventType';
import { TOIMIndexUpdatePayload } from '../types/TOIMIndexUpdatePayload';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexOptions } from '../types/TOIMIndexOptions';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { OIMIndexStore } from './OIMIndexStore';
import { OIMIndexStoreMapDriven } from '../core/OIMIndexStoreMapDriven';

/**
 * Abstract base class for all index types.
 * Provides common functionality and event system for key-to-PKs mappings.
 */
export abstract class OIMIndex<TKey extends TOIMPk, TPk extends TOIMPk> {
    protected readonly comparePks?: TOIMIndexComparator<TPk>;
    protected readonly store: OIMIndexStore<TKey, TPk>;
    public readonly emitter = new OIMEventEmitter<{
        [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TKey>;
    }>();

    constructor(options: TOIMIndexOptions<TKey, TPk> = {}) {
        this.comparePks = options.comparePks;
        this.store = options.store ?? new OIMIndexStoreMapDriven<TKey, TPk>();
    }

    /**
     * Get primary keys for multiple index keys
     */
    public getPksByKeys(keys: readonly TKey[]): Map<TKey, Set<TPk>> {
        return this.store.getManyByKeys(keys);
    }

    /**
     * @deprecated Use getPksByKey instead
     * Get primary keys for a specific index key
     */
    public getPks(key: TKey): Set<TPk> {
        return this.getPksByKey(key);
    }

    /**
     * Get primary keys for a specific index key
     */
    public getPksByKey(key: TKey): Set<TPk> {
        const pksSet = this.store.getOneByKey(key);
        return pksSet ? pksSet : new Set();
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
        const pksSet = this.store.getOneByKey(key);
        return pksSet ? pksSet.size : 0;
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

        for (const pksSet of allPks.values()) {
            totalPks += pksSet.size;
            maxBucketSize = Math.max(maxBucketSize, pksSet.size);
            minBucketSize = Math.min(minBucketSize, pksSet.size);
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
    protected setPksWithComparison(key: TKey, newPks: Set<TPk>): boolean {
        // If comparator is provided, check if arrays are equal
        if (this.comparePks) {
            const existingPksSet = this.store.getOneByKey(key);
            // Quick size check before expensive comparison
            if (existingPksSet && existingPksSet.size === newPks.size) {
                // Convert Sets to arrays for comparator
                const existingPksArray =
                    existingPksSet.size > 0 ? [...existingPksSet] : [];
                const newPksArray = newPks.size > 0 ? [...newPks] : [];

                if (this.comparePks(existingPksArray, newPksArray)) {
                    return false;
                }
            } else if (!existingPksSet && newPks.size === 0) {
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
