import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMKeyedBucketSetBased } from './OIMKeyedBucketSetBased';

export class OIMIndexStoreMapDrivenSetBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMIndexStoreSetBased<TKey, TPk> {
    // Live buckets (non-empty, or freshly promoted). Enumeration reads these only.
    protected readonly slots = new Map<
        TKey,
        OIMKeyedBucketSetBased<TKey, TPk>
    >();
    // Empty buckets kept alive solely by their subscribers, so a subscription
    // survives a key going empty → re-filled. Invisible to reads/enumeration.
    protected readonly reservedBuckets = new Map<
        TKey,
        OIMKeyedBucketSetBased<TKey, TPk>
    >();

    getOrReserveBucket(key: TKey): OIMKeyedBucketSetBased<TKey, TPk> {
        const live = this.slots.get(key);
        if (live) return live;
        let reserved = this.reservedBuckets.get(key);
        if (!reserved) {
            reserved = new OIMKeyedBucketSetBased<TKey, TPk>(key);
            this.reservedBuckets.set(key, reserved);
        }
        return reserved;
    }

    findBucket(key: TKey): OIMKeyedBucketSetBased<TKey, TPk> | undefined {
        return this.slots.get(key) ?? this.reservedBuckets.get(key);
    }

    retainBucket(bucket: OIMKeyedBucketSetBased<TKey, TPk>): void {
        if (bucket.size === 0) return;
        this.reservedBuckets.delete(bucket.key);
        if (!this.slots.has(bucket.key)) this.slots.set(bucket.key, bucket);
    }

    releaseBucket(bucket: OIMKeyedBucketSetBased<TKey, TPk>): void {
        if (bucket.size > 0) return;
        this.slots.delete(bucket.key);
        if (bucket.hasSubscribers()) {
            this.reservedBuckets.set(bucket.key, bucket);
        } else {
            this.reservedBuckets.delete(bucket.key);
        }
    }

    dropIfReserved(key: TKey): void {
        const reserved = this.reservedBuckets.get(key);
        if (reserved && reserved.size === 0 && !reserved.hasSubscribers()) {
            this.reservedBuckets.delete(key);
        }
    }

    setOneByKey(key: TKey, slots: Set<TOIMAnyEntitySlot<TPk>>): void {
        const bucket = this.getOrReserveBucket(key);
        if (bucket !== (slots as unknown)) {
            bucket.clear();
            for (const slot of slots) bucket.add(slot);
        }
        if (bucket.size > 0) this.retainBucket(bucket);
        else this.releaseBucket(bucket);
    }

    removeOneByKey(key: TKey): void {
        this.slots.delete(key);
        this.reservedBuckets.delete(key);
    }

    removeManyByKeys(keys: readonly TKey[]): void {
        for (const key of keys) {
            this.slots.delete(key);
            this.reservedBuckets.delete(key);
        }
    }

    getOneByKey(key: TKey): Set<TOIMAnyEntitySlot<TPk>> | undefined {
        return this.slots.get(key);
    }

    getManyByKeys(
        keys: readonly TKey[]
    ): Map<TKey, Set<TOIMAnyEntitySlot<TPk>>> {
        const result = new Map<TKey, Set<TOIMAnyEntitySlot<TPk>>>();
        for (const key of keys) {
            const slots = this.slots.get(key);
            if (slots !== undefined) result.set(key, slots);
        }
        return result;
    }

    getAllKeys(): TKey[] {
        return Array.from(this.slots.keys());
    }

    getAll(): Map<TKey, Set<TOIMAnyEntitySlot<TPk>>> {
        return new Map(this.slots);
    }

    countAll(): number {
        return this.slots.size;
    }

    clear(): void {
        // Empty every live bucket; keep the subscribed ones alive (reserved) so
        // their subscriptions survive the clear and fire on re-add.
        for (const bucket of this.slots.values()) {
            bucket.clear();
            if (bucket.hasSubscribers()) {
                this.reservedBuckets.set(bucket.key, bucket);
            }
        }
        this.slots.clear();
    }
}
