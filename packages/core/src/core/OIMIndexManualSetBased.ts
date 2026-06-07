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
     * Adds slots to a key's bucket IN PLACE (no copy of the existing Set) and
     * emits once. O(added). Used by collection-bound indexes for fast `addPks`.
     */
    public addSlots(
        key: TIndexKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        if (slots.length === 0) return;
        let bucket = this.store.getOneByKey(key);
        if (!bucket) {
            bucket = new Set();
            this.store.setOneByKey(key, bucket);
        }
        let changed = false;
        for (let i = 0; i < slots.length; i++) {
            if (!bucket.has(slots[i])) {
                bucket.add(slots[i]);
                changed = true;
            }
        }
        if (changed) this.emitUpdateOne(key);
    }

    /**
     * Removes slots from a key's bucket IN PLACE (O(removed)) and emits once.
     */
    public removeSlots(
        key: TIndexKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        if (slots.length === 0) return;
        const bucket = this.store.getOneByKey(key);
        if (!bucket) return;
        let changed = false;
        for (let i = 0; i < slots.length; i++) {
            if (bucket.delete(slots[i])) changed = true;
        }
        if (!changed) return;
        if (bucket.size === 0) this.store.removeOneByKey(key);
        this.emitUpdateOne(key);
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
