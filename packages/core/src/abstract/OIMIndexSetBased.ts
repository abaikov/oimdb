import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { OIMIndexStoreSetBased } from './OIMIndexStoreSetBased';
import { OIMIndexStoreMapDrivenSetBased } from '../core/OIMIndexStoreMapDrivenSetBased';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMIndex } from './OIMIndex';

export abstract class OIMIndexSetBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMIndex<TKey, TPk, Set<TOIMAnyEntitySlot<TPk>>> {
    /**
     * The same store as the base `store`, narrowed to the set-based contract so
     * the carrier-bucket lifecycle methods (`getOrReserveBucket`, …) are visible.
     */
    protected readonly setStore: OIMIndexStoreSetBased<TKey, TPk>;

    constructor(
        options: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreSetBased<TKey, TPk>;
        } = {}
    ) {
        const store =
            options.store ?? new OIMIndexStoreMapDrivenSetBased<TKey, TPk>();
        super(store, options.comparePks);
        this.setStore = store;
    }

    protected getBucketSize(bucket: Set<TOIMAnyEntitySlot<TPk>>): number {
        return bucket.size;
    }

    public getPksByKey(key: TKey): Set<TPk> {
        const slotsSet = this.store.getOneByKey(key);
        return slotsSet ? this.slotsToPks(slotsSet) : new Set();
    }

    public getPksByKeys(keys: readonly TKey[]): Map<TKey, Set<TPk>> {
        const result = new Map<TKey, Set<TPk>>();
        const slotsByKey = this.store.getManyByKeys(keys);
        for (const [key, slots] of slotsByKey) {
            result.set(key, this.slotsToPks(slots));
        }
        return result;
    }

    public getSlotsByKey(key: TKey): ReadonlySet<TOIMAnyEntitySlot<TPk>> {
        return this.store.getOneByKey(key) ?? new Set();
    }

    public getSlotsByKeys(
        keys: readonly TKey[]
    ): Map<TKey, ReadonlySet<TOIMAnyEntitySlot<TPk>>> {
        return this.store.getManyByKeys(keys);
    }

    protected slotsToPks(
        slots: Iterable<TOIMAnyEntitySlot<TPk>>
    ): Set<TPk> {
        const pks = new Set<TPk>();
        for (const slot of slots) pks.add(slot.pk);
        return pks;
    }

    /**
     * True if a comparator is set and considers `bucket`'s current pks equal to
     * `newSlots` — i.e. a `setSlots` would be a no-op and should not emit.
     */
    protected bucketMatchesComparator(
        bucket: ReadonlySet<TOIMAnyEntitySlot<TPk>>,
        newSlots: ReadonlySet<TOIMAnyEntitySlot<TPk>>
    ): boolean {
        if (!this.comparePks) return false;
        if (bucket.size !== newSlots.size) return false;
        if (bucket.size === 0) return true;
        return this.comparePks(
            Array.from(this.slotsToPks(bucket)),
            Array.from(this.slotsToPks(newSlots))
        );
    }
}
