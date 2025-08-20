import { TOIMPk } from '../types/TOIMPk';
import { OIMIndex } from '../abstract/OIMIndex';
import { TOIMIndexOptions } from '../types/TOIMIndexOptions';

/**
 * Manual index that allows direct manipulation of key-to-primary-keys mappings.
 * Extends the abstract OIMIndex with manual control methods and optional comparison.
 */
export class OIMIndexManual<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndex<TIndexKey, TPk> {
    constructor(options: TOIMIndexOptions<TPk> = {}) {
        super(options);
    }
    /**
     * Set primary keys for a specific index key, replacing any existing values.
     * Uses optional comparator to skip updates if PKs haven't actually changed.
     */
    public setPks(key: TIndexKey, pks: readonly TPk[]): void {
        // Use base class method that handles comparison
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

        let pksSet = this.pks.get(key);
        if (!pksSet) {
            pksSet = new Set();
            this.pks.set(key, pksSet);
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
            this.emitUpdate([key]);
        }
    }

    /**
     * Remove primary keys from a specific index key
     */
    public removePks(key: TIndexKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const pksSet = this.pks.get(key);
        if (!pksSet) return;

        let hasChanges = false;
        for (const pk of pks) {
            if (pksSet.delete(pk)) {
                hasChanges = true;
            }
        }

        // Clean up empty buckets
        if (pksSet.size === 0) {
            this.pks.delete(key);
            hasChanges = true;
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
            if (this.pks.size > 0) {
                const allKeys = Array.from(this.pks.keys());
                this.pks.clear();
                this.emitUpdate(allKeys);
            }
        } else {
            // Clear specific bucket
            if (this.pks.has(key)) {
                this.pks.delete(key);
                this.emitUpdate([key]);
            }
        }
    }
}
