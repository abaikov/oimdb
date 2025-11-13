import { TOIMPk } from '../types/TOIMPk';
import { OIMIndexArrayBased } from '../abstract/OIMIndexArrayBased';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';

/**
 * Manual Array-based index that allows direct manipulation of key-to-primary-keys mappings.
 * Extends the abstract OIMIndexArrayBased with manual control methods and optional comparison.
 */
export class OIMIndexManualArrayBased<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexArrayBased<TIndexKey, TPk> {
    constructor(options: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreArrayBased<TIndexKey, TPk>;
    } = {}) {
        super(options);
    }

    /**
     * Set primary keys for a specific index key, replacing any existing values.
     * Uses optional comparator to skip updates if PKs haven't actually changed.
     */
    public setPks(key: TIndexKey, pks: TPk[]): void {
        const hasChanges = this.setPksWithComparison(key, pks);

        if (hasChanges) {
            this.emitUpdate([key]);
        }
    }

    /**
     * Add primary keys to a specific index key
     */
    public addPks(key: TIndexKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        let pksArray = this.store.getOneByKey(key);
        if (!pksArray) {
            pksArray = [];
            this.store.setOneByKey(key, pksArray);
        }

        // Use Set to avoid duplicates, then convert back to array
        const pksSet = new Set(pksArray);
        let hasChanges = false;
        for (const pk of pks) {
            if (!pksSet.has(pk)) {
                pksSet.add(pk);
                hasChanges = true;
            }
        }

        if (hasChanges) {
            this.store.setOneByKey(key, Array.from(pksSet));
            this.emitUpdate([key]);
        }
    }

    /**
     * Remove primary keys from a specific index key
     */
    public removePks(key: TIndexKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const pksArray = this.store.getOneByKey(key);
        if (!pksArray) return;

        const pksSet = new Set(pks);
        const filtered = pksArray.filter((pk) => !pksSet.has(pk));
        const hasChanges = filtered.length !== pksArray.length;

        if (hasChanges) {
            if (filtered.length === 0) {
                this.store.removeOneByKey(key);
            } else {
                this.store.setOneByKey(key, filtered);
            }
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

