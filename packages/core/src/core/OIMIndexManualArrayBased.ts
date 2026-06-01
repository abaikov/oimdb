import { TOIMPk } from '../type/TOIMPk';
import { OIMIndexArrayBased } from '../abstract/OIMIndexArrayBased';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { TOIMIndexComparator } from '../type/TOIMIndexComparator';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlotResolver,
} from '../type/TOIMEntitySlot';

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
            resolveSlot?: TOIMEntitySlotResolver<TPk>;
        } = {}
    ) {
        super(options);
    }

    /**
     * Set primary keys for a specific index key, replacing any existing values.
     * Uses optional comparator to skip updates if PKs haven't actually changed.
     */
    public setPks(key: TIndexKey, pks: TPk[]): void {
        const hasChanges = this.setPksWithComparison(key, pks);

        if (hasChanges) {
            this.emitUpdateOne(key);
        }
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
     * Add primary keys to a specific index key
     */
    public addPks(key: TIndexKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        let slotsArray = this.store.getOneByKey(key);
        if (!slotsArray) {
            slotsArray = [];
            this.store.setOneByKey(key, slotsArray);
        }

        // Use Set to avoid duplicates, then convert back to array
        const pksSet = new Set(slotsArray.map(slot => slot.pk));
        let hasChanges = false;
        const nextSlots = slotsArray.slice();
        for (const pk of pks) {
            if (!pksSet.has(pk)) {
                pksSet.add(pk);
                nextSlots.push(this.getOrCreateSlot(pk));
                hasChanges = true;
            }
        }

        if (hasChanges) {
            this.store.setOneByKey(key, nextSlots);
            this.emitUpdateOne(key);
        }
    }

    /**
     * Remove primary keys from a specific index key
     */
    public removePks(key: TIndexKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const slotsArray = this.store.getOneByKey(key);
        if (!slotsArray) return;

        const pksSet = new Set(pks);
        const filtered = slotsArray.filter(slot => !pksSet.has(slot.pk));
        const hasChanges = filtered.length !== slotsArray.length;

        if (hasChanges) {
            if (filtered.length === 0) {
                this.store.removeOneByKey(key);
            } else {
                this.store.setOneByKey(key, filtered);
            }
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
