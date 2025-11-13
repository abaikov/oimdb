import { TOIMPk } from '../types/TOIMPk';
import { OIMIndexSetBased } from '../abstract/OIMIndexSetBased';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';

/**
 * Manual Set-based index that allows direct manipulation of key-to-primary-keys mappings.
 * Extends the abstract OIMIndexSetBased with manual control methods and optional comparison.
 */
export class OIMIndexManualSetBased<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexSetBased<TIndexKey, TPk> {
    constructor(options: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreSetBased<TIndexKey, TPk>;
    } = {}) {
        super(options);
    }
    /**
     * Set primary keys for a specific index key, replacing any existing values.
     * Uses optional comparator to skip updates if PKs haven't actually changed.
     */
    public setPks(key: TIndexKey, pks: TPk[]): void {
        // Use base class method that handles comparison
        // Set creation is necessary for comparison logic
        const hasChanges = this.setPksWithComparison(key, new Set(pks));

        if (hasChanges) {
            this.emitUpdate([key]);
        }
    }

    /**
     * Add primary keys to a specific index key
     */
    public addPks(key: TIndexKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        let pksSet = this.store.getOneByKey(key);
        if (!pksSet) {
            pksSet = new Set();
            this.store.setOneByKey(key, pksSet);
        }

        let hasChanges = false;
        for (const pk of pks) {
            // Check if pk already exists before adding to avoid size check
            if (!pksSet.has(pk)) {
                pksSet.add(pk);
                hasChanges = true;
            }
        }

        if (hasChanges) {
            this.store.setOneByKey(key, pksSet);
            this.emitUpdate([key]);
        }
    }

    /**
     * Remove primary keys from a specific index key
     */
    public removePks(key: TIndexKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const pksSet = this.store.getOneByKey(key);
        if (!pksSet) return;

        let hasChanges = false;
        for (const pk of pks) {
            if (pksSet.delete(pk)) {
                hasChanges = true;
            }
        }

        // Clean up empty buckets
        if (pksSet.size === 0) {
            this.store.removeOneByKey(key);
            hasChanges = true;
        } else if (hasChanges) {
            this.store.setOneByKey(key, pksSet);
        }

        if (hasChanges) {
            this.emitUpdate([key]);
        }
    }

    /**
     * Clear all primary keys for a specific index key, or all keys if no key specified
     */
    public clear(key?: TIndexKey): void {
        if (key === undefined) {
            // Clear all buckets
            const allKeys = this.store.getAllKeys();
            if (allKeys.length > 0) {
                this.store.clear();
                this.emitUpdate(allKeys);
            }
        } else {
            // Clear specific bucket
            if (this.store.getOneByKey(key) !== undefined) {
                this.store.removeOneByKey(key);
                this.emitUpdate([key]);
            }
        }
    }
}
