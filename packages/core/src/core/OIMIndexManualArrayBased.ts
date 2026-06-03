import { TOIMPk } from '../types/TOIMPk';
import { OIMIndexArrayBased } from '../abstract/OIMIndexArrayBased';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

/**
 * Manual Array-based index that allows direct manipulation of key-to-primary-keys mappings.
 * Extends the abstract OIMIndexArrayBased with manual control methods and optional comparison.
 */
export class OIMIndexManualArrayBased<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndexArrayBased<TIndexKey, TPk> {
    constructor(
        options: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreArrayBased<TIndexKey, TPk>;
        } = {}
    ) {
        super(options);
    }

    public setSlots(
        key: TIndexKey,
        slots: TOIMAnyEntitySlot<TPk>[]
    ): void {
        const hasChanges = this.setSlotsWithComparison(key, slots);

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
