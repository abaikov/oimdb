import {
    TOIMPk,
    OIMEventEmitter,
    EOIMIndexEventType,
    TOIMIndexUpdatePayload,
    TOIMIndexComparator,
} from '@oimdb/core';
import { IOIMIndexStoreAsync } from '../interfaces/IOIMIndexStoreAsync';
import { TOIMIndexOptionsAsync } from '../types/TOIMIndexOptionsAsync';
import { OIMIndexStoreMapDrivenAsync } from './OIMIndexStoreMapDrivenAsync';

/**
 * Async manual index that allows direct manipulation of key-to-primary-keys mappings.
 * Stores data in memory (index state, not cache) and synchronizes writes with async store.
 */
export class OIMIndexManualAsync<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    protected readonly comparePks?: TOIMIndexComparator<TPk>;
    protected readonly store: IOIMIndexStoreAsync<TIndexKey, TPk>;
    public readonly emitter = new OIMEventEmitter<{
        [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TIndexKey>;
    }>();

    constructor(options: TOIMIndexOptionsAsync<TIndexKey, TPk> = {}) {
        this.comparePks = options.comparePks;
        this.store =
            options.store ?? new OIMIndexStoreMapDrivenAsync<TIndexKey, TPk>();
    }

    /**
     * Get primary keys for multiple index keys
     */
    public async getPksByKeys(keys: readonly TIndexKey[]): Promise<Map<TIndexKey, Set<TPk>>> {
        return await this.store.getManyByKeys(keys);
    }

    /**
     * @deprecated Use getPksByKey instead
     * Get primary keys for a specific index key
     */
    public async getPks(key: TIndexKey): Promise<Set<TPk>> {
        return await this.getPksByKey(key);
    }

    /**
     * Get primary keys for a specific index key
     */
    public async getPksByKey(key: TIndexKey): Promise<Set<TPk>> {
        const pksSet = await this.store.getOneByKey(key);
        return pksSet ? pksSet : new Set();
    }

    /**
     * Check if an index key exists
     */
    public async hasKey(key: TIndexKey): Promise<boolean> {
        const pksSet = await this.store.getOneByKey(key);
        return pksSet !== undefined;
    }

    /**
     * Get all index keys
     */
    public async getKeys(): Promise<readonly TIndexKey[]> {
        return await this.store.getAllKeys();
    }

    /**
     * Get the number of primary keys for a specific index key
     */
    public async getKeySize(key: TIndexKey): Promise<number> {
        const pksSet = await this.store.getOneByKey(key);
        return pksSet ? pksSet.size : 0;
    }

    /**
     * Get total number of index keys
     */
    public async getSize(): Promise<number> {
        return await this.store.countAll();
    }

    /**
     * Check if the index is empty
     */
    public async isEmpty(): Promise<boolean> {
        const count = await this.store.countAll();
        return count === 0;
    }

    /**
     * Get performance metrics for monitoring and debugging
     */
    public async getMetrics() {
        let totalPks = 0;
        let maxBucketSize = 0;
        let minBucketSize = Infinity;
        const allPks = await this.store.getAll();

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
    public async destroy(): Promise<void> {
        this.emitter.offAll();
        await this.store.clear();
    }

    /**
     * Set primary keys for a specific index key, replacing any existing values.
     * Uses optional comparator to skip updates if PKs haven't actually changed.
     */
    public async setPks(key: TIndexKey, pks: TPk[]): Promise<void> {
        const hasChanges = await this.setPksWithComparison(key, new Set(pks));

        if (hasChanges) {
            await this.store.setOneByKey(key, new Set(pks));
            this.emitUpdate([key]);
        }
    }

    /**
     * Add primary keys to a specific index key.
     */
    public async addPks(key: TIndexKey, pks: readonly TPk[]): Promise<void> {
        if (pks.length === 0) return;

        let pksSet = await this.store.getOneByKey(key);
        if (!pksSet) {
            pksSet = new Set();
        }

        let hasChanges = false;
        for (const pk of pks) {
            const sizeBefore = pksSet.size;
            pksSet.add(pk);
            if (pksSet.size > sizeBefore) {
                hasChanges = true;
            }
        }

        if (hasChanges) {
            await this.store.setOneByKey(key, pksSet);
            this.emitUpdate([key]);
        }
    }

    /**
     * Remove primary keys from a specific index key.
     */
    public async removePks(key: TIndexKey, pks: readonly TPk[]): Promise<void> {
        if (pks.length === 0) return;

        const pksSet = await this.store.getOneByKey(key);
        if (!pksSet) return;

        let hasChanges = false;
        for (const pk of pks) {
            if (pksSet.delete(pk)) {
                hasChanges = true;
            }
        }

        // Clean up empty buckets
        if (pksSet.size === 0) {
            await this.store.removeOneByKey(key);
            hasChanges = true;
        } else if (hasChanges) {
            await this.store.setOneByKey(key, pksSet);
        }

        if (hasChanges) {
            this.emitUpdate([key]);
        }
    }

    /**
     * Clear all primary keys for a specific index key, or all keys if no key specified.
     */
    public async clear(key?: TIndexKey): Promise<void> {
        if (key === undefined) {
            // Clear all buckets
            const allKeys = await this.store.getAllKeys();
            if (allKeys.length > 0) {
                await this.store.clear();
                this.emitUpdate(allKeys);
            }
        } else {
            // Clear specific bucket
            const pksSet = await this.store.getOneByKey(key);
            if (pksSet !== undefined) {
                await this.store.removeOneByKey(key);
                this.emitUpdate([key]);
            }
        }
    }

    /**
     * Set primary keys for a specific index key with optional comparison.
     * If comparator is provided and returns true (no changes), skip the update.
     */
    protected async setPksWithComparison(key: TIndexKey, newPks: Set<TPk>): Promise<boolean> {
        const existingPks = await this.getPksByKey(key);

        // If comparator is provided, check if arrays are equal
        if (
            this.comparePks &&
            this.comparePks(
                Array.from(existingPks.values()),
                Array.from(newPks.values())
            )
        ) {
            return false;
        }

        return true;
    }

    /**
     * Emit update event with changed keys
     */
    protected emitUpdate(keys: TIndexKey[]): void {
        this.emitter.emit(EOIMIndexEventType.UPDATE, { keys });
    }
}

