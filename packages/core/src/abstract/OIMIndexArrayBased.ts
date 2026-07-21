import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { OIMIndexStoreArrayBased } from './OIMIndexStoreArrayBased';
import { OIMIndexStoreMapDrivenArrayBased } from '../core/OIMIndexStoreMapDrivenArrayBased';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMIndex } from './OIMIndex';

export abstract class OIMIndexArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMIndex<TKey, TPk, TOIMAnyEntitySlot<TPk>[]> {
    /** The same store as `store`, narrowed to expose the carrier-bucket lifecycle. */
    protected readonly arrayStore: OIMIndexStoreArrayBased<TKey, TPk>;

    constructor(
        options: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreArrayBased<TKey, TPk>;
        } = {}
    ) {
        const store =
            options.store ?? new OIMIndexStoreMapDrivenArrayBased<TKey, TPk>();
        super(store, options.comparePks);
        this.arrayStore = store;
    }

    protected getBucketSize(bucket: TOIMAnyEntitySlot<TPk>[]): number {
        return bucket.length;
    }

    public getPksByKey(key: TKey): TPk[] {
        const slotsArray = this.store.getOneByKey(key);
        return slotsArray ? this.slotsToPks(slotsArray) : [];
    }

    public getPksByKeys(keys: readonly TKey[]): Map<TKey, TPk[]> {
        const result = new Map<TKey, TPk[]>();
        const slotsByKey = this.store.getManyByKeys(keys);
        for (const [key, slots] of slotsByKey) {
            result.set(key, this.slotsToPks(slots));
        }
        return result;
    }

    public getSlotsByKey(key: TKey): readonly TOIMAnyEntitySlot<TPk>[] {
        // Return a snapshot copy: the live bucket is a stable carrier mutated in
        // place, so callers that hold or diff the result need their own array.
        const bucket = this.store.getOneByKey(key);
        return bucket ? bucket.slice() : [];
    }

    public getSlotsByKeys(
        keys: readonly TKey[]
    ): Map<TKey, readonly TOIMAnyEntitySlot<TPk>[]> {
        const result = new Map<TKey, readonly TOIMAnyEntitySlot<TPk>[]>();
        for (const [key, bucket] of this.store.getManyByKeys(keys)) {
            result.set(key, bucket.slice());
        }
        return result;
    }

    protected slotsToPks(
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): TPk[] {
        const pks: TPk[] = [];
        pks.length = slots.length;
        for (let i = 0; i < slots.length; i++) pks[i] = slots[i].pk;
        return pks;
    }

    /**
     * True if a comparator is set and considers `bucket`'s pks equal to
     * `newSlots` — i.e. a `setSlots` would be a no-op and should not emit.
     */
    protected bucketMatchesComparator(
        bucket: readonly TOIMAnyEntitySlot<TPk>[],
        newSlots: readonly TOIMAnyEntitySlot<TPk>[]
    ): boolean {
        if (!this.comparePks) return false;
        if (bucket.length !== newSlots.length) return false;
        if (bucket.length === 0) return true;
        return this.comparePks(
            this.slotsToPks(bucket),
            this.slotsToPks(newSlots)
        );
    }
}
