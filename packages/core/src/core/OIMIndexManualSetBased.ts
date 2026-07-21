import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { OIMIndexSetBased } from '../abstract/OIMIndexSetBased';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMKeyedBucketSetBased } from './OIMKeyedBucketSetBased';
import { IOIMKeyDomain } from '../interfaces/IOIMKeyDomain';
import { IOIMKeyedMap } from '../interfaces/IOIMKeyedMap';
import { OIMKeyDomainNative } from './OIMKeyDomainNative';

/**
 * Manual Set-based index with direct key→slots control.
 *
 * Buckets are stable carrier buckets owned by the store (`getOrReserveBucket`):
 * a write mutates the SAME bucket in place and then calls `emitBucketChanged`,
 * so the reactive subclass delivers straight off that bucket in O(1). Emptied
 * buckets are released (kept only while subscribed); the store keeps a
 * subscribed-but-empty bucket alive so a subscription survives a key going empty
 * and re-filling.
 */
export class OIMIndexManualSetBased<
    TIndexKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMIndexSetBased<TIndexKey, TPk> {
    // Keys the per-bucket pk → slot membership. Native for primitive PKs, trie
    // for composite PK paths (passed down from the collection's key domain).
    protected readonly pkDomain: IOIMKeyDomain<TPk>;

    constructor(
        options: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreSetBased<TIndexKey, TPk>;
            pkDomain?: IOIMKeyDomain<TPk>;
        } = {}
    ) {
        super(options);
        this.pkDomain = options.pkDomain ?? new OIMKeyDomainNative<TPk>();
    }

    public setSlots(
        key: TIndexKey,
        slots: Iterable<TOIMAnyEntitySlot<TPk>>
    ): void {
        const bucket = this.setStore.getOrReserveBucket(key);
        this.replaceBucketContents(bucket, slots);
    }

    // --- pk-oriented writes: resolve the bucket ONCE and use its own membership
    // (pk → slot) for dedup/removal, so a composite (trie) key is walked a single
    // time instead of once for the bucket and once for a separate membership map.

    public setPks(
        key: TIndexKey,
        pks: readonly TPk[],
        resolveSlot: (pk: TPk) => TOIMAnyEntitySlot<TPk>
    ): void {
        const bucket = this.setStore.getOrReserveBucket(key);
        const slots: TOIMAnyEntitySlot<TPk>[] = [];
        for (let i = 0; i < pks.length; i++) slots.push(resolveSlot(pks[i]));
        // Replace bucket contents first (this also clears membership via the
        // bucket's `clear()`), then rebuild membership from the resolved slots.
        this.replaceBucketContents(bucket, slots);
        const membership =
            bucket.membership ??
            (bucket.membership = this.pkDomain.createMap());
        membership.clear();
        for (let i = 0; i < pks.length; i++) {
            if (!membership.has(pks[i])) membership.set(pks[i], slots[i]);
        }
    }

    public addPks(
        key: TIndexKey,
        pks: readonly TPk[],
        resolveSlot: (pk: TPk) => TOIMAnyEntitySlot<TPk>
    ): void {
        if (pks.length === 0) return;
        const bucket = this.setStore.getOrReserveBucket(key);
        const membership = this.membershipOf(bucket);
        let changed = false;
        for (let i = 0; i < pks.length; i++) {
            const pk = pks[i];
            if (membership.has(pk)) continue;
            const slot = resolveSlot(pk);
            membership.set(pk, slot);
            if (!bucket.has(slot)) {
                bucket.add(slot);
                changed = true;
            }
        }
        if (!changed) return;
        this.setStore.retainBucket(bucket);
        this.emitBucketChanged(bucket);
    }

    public removePks(key: TIndexKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;
        const bucket = this.setStore.findBucket(key);
        if (!bucket || bucket.size === 0) return;
        // Seed membership from the bucket's slots if it was populated through the
        // lower-level `setSlots` path (so remove-by-pk still works).
        const membership = this.membershipOf(bucket);
        let changed = false;
        for (let i = 0; i < pks.length; i++) {
            const slot = membership.get(pks[i]);
            if (slot) {
                membership.delete(pks[i]);
                if (bucket.delete(slot)) changed = true;
            }
        }
        if (!changed) return;
        if (bucket.size === 0) this.setStore.releaseBucket(bucket);
        this.emitBucketChanged(bucket);
    }

    /**
     * The bucket's pk → slot membership, lazily created and seeded from the
     * bucket's current slots (so it stays correct even if slots were written
     * through the lower-level `setSlots` path).
     */
    private membershipOf(
        bucket: OIMKeyedBucketSetBased<TIndexKey, TPk>
    ): IOIMKeyedMap<TPk, TOIMAnyEntitySlot<TPk>> {
        let membership = bucket.membership;
        if (!membership) {
            membership = this.pkDomain.createMap();
            bucket.membership = membership;
        }
        if (membership.size === 0 && bucket.size > 0) {
            for (const slot of bucket) membership.set(slot.pk, slot);
        }
        return membership;
    }

    private replaceBucketContents(
        bucket: OIMKeyedBucketSetBased<TIndexKey, TPk>,
        slots: Iterable<TOIMAnyEntitySlot<TPk>>
    ): void {
        if (this.comparePks) {
            const newSet = slots instanceof Set ? slots : new Set(slots);
            if (this.bucketMatchesComparator(bucket, newSet)) return;
            bucket.clear();
            for (const slot of newSet) bucket.add(slot);
        } else {
            // No comparator: replace in place with no throwaway Set allocation.
            bucket.clear();
            for (const slot of slots) bucket.add(slot);
        }

        if (bucket.size > 0) this.setStore.retainBucket(bucket);
        else this.setStore.releaseBucket(bucket);
        this.emitBucketChanged(bucket);
    }

    /**
     * Adds slots to a key's bucket IN PLACE and emits once. O(added).
     */
    public addSlots(
        key: TIndexKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        if (slots.length === 0) return;
        const bucket = this.setStore.getOrReserveBucket(key);
        let changed = false;
        for (let i = 0; i < slots.length; i++) {
            if (!bucket.has(slots[i])) {
                bucket.add(slots[i]);
                changed = true;
            }
        }
        if (!changed) return;
        this.setStore.retainBucket(bucket);
        this.emitBucketChanged(bucket);
    }

    /**
     * Removes slots from a key's bucket IN PLACE (O(removed)) and emits once.
     */
    public removeSlots(
        key: TIndexKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        if (slots.length === 0) return;
        const bucket = this.setStore.findBucket(key);
        if (!bucket) return;
        let changed = false;
        for (let i = 0; i < slots.length; i++) {
            if (bucket.delete(slots[i])) changed = true;
        }
        if (!changed) return;
        if (bucket.size === 0) this.setStore.releaseBucket(bucket);
        this.emitBucketChanged(bucket);
    }

    /**
     * Clear all primary keys for a specific index key, or all keys if none given.
     */
    public clear(key?: TIndexKey): void {
        if (key === undefined) {
            const allKeys = this.store.getAllKeys();
            if (allKeys.length > 0) {
                this.store.clear();
                this.emitUpdate(allKeys);
            }
        } else {
            const bucket = this.setStore.findBucket(key);
            if (bucket && bucket.size > 0) {
                bucket.clear();
                this.setStore.releaseBucket(bucket);
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
        bucket: OIMKeyedBucketSetBased<TIndexKey, TPk>
    ): void {
        this.emitUpdateOne(bucket.key);
    }
}
