import { OIMEventEmitter } from '../core/OIMEventEmitter';
import { EOIMIndexEventType } from '../enum/EOIMIndexEventType';
import { TOIMIndexUpdatePayload } from '../types/TOIMIndexUpdatePayload';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexOptions } from '../types/TOIMIndexOptions';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';

/**
 * Abstract base class for all index types.
 * Provides common functionality and event system for key-to-PKs mappings.
 */
export abstract class OIMIndex<TKey extends TOIMPk, TPk extends TOIMPk> {
    protected readonly pks = new Map<TKey, Set<TPk>>();
    protected readonly comparePks?: TOIMIndexComparator<TPk>;
    public readonly emitter = new OIMEventEmitter<{
        [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TKey>;
    }>();

    constructor(options: TOIMIndexOptions<TPk> = {}) {
        this.comparePks = options.comparePks;
    }

    /**
     * Get primary keys for multiple index keys
     */
    public getPksByKeys(keys: readonly TKey[]): Map<TKey, readonly TPk[]> {
        return new Map(keys.map(key => [key, this.getPks(key)]));
    }

    /**
     * Get primary keys for a specific index key
     */
    public getPks(key: TKey): readonly TPk[] {
        const pksSet = this.pks.get(key);
        return pksSet ? Array.from(pksSet) : [];
    }

    /**
     * Check if an index key exists
     */
    public hasKey(key: TKey): boolean {
        return this.pks.has(key);
    }

    /**
     * Get all index keys
     */
    public getKeys(): readonly TKey[] {
        return Array.from(this.pks.keys());
    }

    /**
     * Get the number of primary keys for a specific index key
     */
    public getKeySize(key: TKey): number {
        const pksSet = this.pks.get(key);
        return pksSet ? pksSet.size : 0;
    }

    /**
     * Get total number of index keys
     */
    public get size(): number {
        return this.pks.size;
    }

    /**
     * Check if the index is empty
     */
    public get isEmpty(): boolean {
        return this.pks.size === 0;
    }

    /**
     * Get performance metrics for monitoring and debugging
     */
    public getMetrics() {
        let totalPks = 0;
        let maxBucketSize = 0;
        let minBucketSize = Infinity;

        for (const pksSet of this.pks.values()) {
            totalPks += pksSet.size;
            maxBucketSize = Math.max(maxBucketSize, pksSet.size);
            minBucketSize = Math.min(minBucketSize, pksSet.size);
        }

        return {
            totalKeys: this.pks.size,
            totalPks,
            averagePksPerKey: this.pks.size > 0 ? totalPks / this.pks.size : 0,
            maxBucketSize: maxBucketSize === -Infinity ? 0 : maxBucketSize,
            minBucketSize: minBucketSize === Infinity ? 0 : minBucketSize,
        };
    }

    /**
     * Clean up event listeners when index is no longer needed
     */
    public destroy(): void {
        this.emitter.offAll();
        this.pks.clear();
    }

    /**
     * Set primary keys for a specific index key with optional comparison.
     * If comparator is provided and returns true (no changes), skip the update.
     */
    protected setPksWithComparison(key: TKey, newPks: readonly TPk[]): boolean {
        const existingPks = this.getPks(key);

        // If comparator is provided, check if arrays are equal
        if (this.comparePks && this.comparePks(existingPks, newPks)) {
            return false; // No changes, skip update
        }

        // Update the PKs
        this.pks.set(key, new Set(newPks));
        return true; // Changes made
    }

    /**
     * Emit update event with changed keys
     */
    protected emitUpdate(keys: TKey[]): void {
        this.emitter.emit(EOIMIndexEventType.UPDATE, { keys });
    }
}
