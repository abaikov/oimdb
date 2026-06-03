import { TOIMPk } from '../types/TOIMPk';
import { OIMIndexSetBased } from '../abstract/OIMIndexSetBased';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

/**
 * Manual Set-based index that allows direct manipulation of key-to-primary-keys mappings.
 * Extends the abstract OIMIndexSetBased with manual control methods and optional comparison.
 */
export class OIMIndexManualSetBased<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexSetBased<TIndexKey, TPk> {
    constructor(
        options: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreSetBased<TIndexKey, TPk>;
        } = {}
    ) {
        super(options);
    }

    public setSlots(
        key: TIndexKey,
        slots: Iterable<TOIMAnyEntitySlot<TPk>>
    ): void {
        const hasChanges = this.setSlotsWithComparison(key, new Set(slots));

        if (hasChanges) {
            this.emitUpdateOne(key);
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
                this.emitUpdateOne(key);
            }
        }
    }
}
