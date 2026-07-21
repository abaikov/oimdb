import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMKeyedBucketArrayBased } from './OIMKeyedBucketArrayBased';

export class OIMIndexStoreMapDrivenArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMIndexStoreArrayBased<TKey, TPk> {
    // Live buckets (non-empty). Enumeration reads these only.
    protected readonly slots = new Map<
        TKey,
        OIMKeyedBucketArrayBased<TKey, TPk>
    >();
    // Empty buckets kept alive by their subscribers, invisible to reads.
    protected readonly reservedBuckets = new Map<
        TKey,
        OIMKeyedBucketArrayBased<TKey, TPk>
    >();

    getOrReserveBucket(key: TKey): OIMKeyedBucketArrayBased<TKey, TPk> {
        const live = this.slots.get(key);
        if (live) return live;
        let reserved = this.reservedBuckets.get(key);
        if (!reserved) {
            reserved = new OIMKeyedBucketArrayBased<TKey, TPk>(key);
            this.reservedBuckets.set(key, reserved);
        }
        return reserved;
    }

    findBucket(key: TKey): OIMKeyedBucketArrayBased<TKey, TPk> | undefined {
        return this.slots.get(key) ?? this.reservedBuckets.get(key);
    }

    retainBucket(bucket: OIMKeyedBucketArrayBased<TKey, TPk>): void {
        if (bucket.length === 0) return;
        this.reservedBuckets.delete(bucket.key);
        if (!this.slots.has(bucket.key)) this.slots.set(bucket.key, bucket);
    }

    releaseBucket(bucket: OIMKeyedBucketArrayBased<TKey, TPk>): void {
        if (bucket.length > 0) return;
        this.slots.delete(bucket.key);
        if (bucket.hasSubscribers()) {
            this.reservedBuckets.set(bucket.key, bucket);
        } else {
            this.reservedBuckets.delete(bucket.key);
        }
    }

    dropIfReserved(key: TKey): void {
        const reserved = this.reservedBuckets.get(key);
        if (reserved && reserved.length === 0 && !reserved.hasSubscribers()) {
            this.reservedBuckets.delete(key);
        }
    }

    setOneByKey(key: TKey, slots: TOIMAnyEntitySlot<TPk>[]): void {
        const bucket = this.getOrReserveBucket(key);
        if ((bucket as unknown) !== slots) {
            bucket.length = 0;
            for (let i = 0; i < slots.length; i++) bucket.push(slots[i]);
        }
        if (bucket.length > 0) this.retainBucket(bucket);
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

    getOneByKey(key: TKey): TOIMAnyEntitySlot<TPk>[] | undefined {
        return this.slots.get(key);
    }

    getManyByKeys(keys: readonly TKey[]): Map<TKey, TOIMAnyEntitySlot<TPk>[]> {
        const result = new Map<TKey, TOIMAnyEntitySlot<TPk>[]>();
        for (const key of keys) {
            const slots = this.slots.get(key);
            if (slots !== undefined) result.set(key, slots);
        }
        return result;
    }

    getAllKeys(): TKey[] {
        return Array.from(this.slots.keys());
    }

    getAll(): Map<TKey, TOIMAnyEntitySlot<TPk>[]> {
        return new Map(this.slots);
    }

    countAll(): number {
        return this.slots.size;
    }

    clear(): void {
        for (const bucket of this.slots.values()) {
            bucket.length = 0;
            if (bucket.hasSubscribers()) {
                this.reservedBuckets.set(bucket.key, bucket);
            }
        }
        this.slots.clear();
    }
}
