import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { OIMIndexArrayBased } from '../abstract/OIMIndexArrayBased';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMKeyedBucketArrayBased } from './OIMKeyedBucketArrayBased';

/**
 * Manual Array-based (ordered) index with direct key→slots control.
 *
 * Buckets are stable carrier buckets owned by the store (`getOrReserveBucket`):
 * a write mutates the SAME bucket in place and then calls `emitBucketChanged`,
 * so the reactive subclass delivers straight off that bucket in O(1). Emptied
 * buckets are released (kept only while subscribed).
 */
export class OIMIndexManualArrayBased<
    TIndexKey extends TOIMKey,
    TPk extends TOIMKey,
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
        const bucket = this.arrayStore.getOrReserveBucket(key);
        if (this.bucketMatchesComparator(bucket, slots)) return;
        bucket.length = 0;
        for (let i = 0; i < slots.length; i++) bucket.push(slots[i]);
        if (bucket.length > 0) this.arrayStore.retainBucket(bucket);
        else this.arrayStore.releaseBucket(bucket);
        this.emitBucketChanged(bucket);
    }

    /**
     * Appends pre-deduplicated slots to a key's bucket IN PLACE and emits once.
     * O(added); callers own dedup.
     */
    public appendSlots(
        key: TIndexKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        if (slots.length === 0) return;
        const bucket = this.arrayStore.getOrReserveBucket(key);
        for (let i = 0; i < slots.length; i++) bucket.push(slots[i]);
        this.arrayStore.retainBucket(bucket);
        this.emitBucketChanged(bucket);
    }

    /**
     * Clear all primary keys for a specific index key, or all keys if none given.
     */
    public clear(key?: TIndexKey): void {
        if (key === undefined) {
            const allKeys = this.arrayStore.getAllKeys();
            if (allKeys.length > 0) {
                this.arrayStore.clear();
                this.emitUpdate(allKeys);
            }
        } else {
            const bucket = this.arrayStore.findBucket(key);
            if (bucket && bucket.length > 0) {
                bucket.length = 0;
                this.arrayStore.releaseBucket(bucket);
                this.emitBucketChanged(bucket);
            }
        }
    }

    /**
     * Emit that a bucket changed. Base (non-reactive) path emits by key on the
     * plain event emitter; the reactive subclass overrides this to mark the
     * bucket carrier directly (O(1), no key→carrier lookup).
     */
    protected emitBucketChanged(
        bucket: OIMKeyedBucketArrayBased<TIndexKey, TPk>
    ): void {
        this.emitUpdateOne(bucket.key);
    }
}
