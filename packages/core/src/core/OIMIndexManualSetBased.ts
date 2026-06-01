import { TOIMPk } from '../type/TOIMPk';
import { OIMIndexSetBased } from '../abstract/OIMIndexSetBased';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import { TOIMIndexComparator } from '../type/TOIMIndexComparator';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlotResolver,
} from '../type/TOIMEntitySlot';

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
        // Use base class method that handles comparison
        // Set creation is necessary for comparison logic
        const hasChanges = this.setPksWithComparison(key, new Set(pks));

        if (hasChanges) {
            this.emitUpdateOne(key);
        }
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
     * Add primary keys to a specific index key
     */
    public addPks(key: TIndexKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        let slotsSet = this.store.getOneByKey(key);
        if (!slotsSet) {
            slotsSet = new Set();
            this.store.setOneByKey(key, slotsSet);
        }

        const pksSet = this.slotsToPks(slotsSet);
        let hasChanges = false;
        for (const pk of pks) {
            // Check if pk already exists before adding to avoid size check
            if (!pksSet.has(pk)) {
                pksSet.add(pk);
                slotsSet.add(this.getOrCreateSlot(pk));
                hasChanges = true;
            }
        }

        if (hasChanges) {
            this.store.setOneByKey(key, slotsSet);
            this.emitUpdateOne(key);
        }
    }

    /**
     * Remove primary keys from a specific index key
     */
    public removePks(key: TIndexKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const slotsSet = this.store.getOneByKey(key);
        if (!slotsSet) return;

        let hasChanges = false;
        const pksToRemove = new Set(pks);
        for (const slot of Array.from(slotsSet)) {
            if (pksToRemove.has(slot.pk) && slotsSet.delete(slot)) {
                hasChanges = true;
            }
        }

        // Clean up empty buckets
        if (slotsSet.size === 0) {
            this.store.removeOneByKey(key);
            hasChanges = true;
        } else if (hasChanges) {
            this.store.setOneByKey(key, slotsSet);
        }

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
