import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMKeyPath } from '../types/TOIMKeyPath';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMKeyedBucketSetBased } from './OIMKeyedBucketSetBased';
import { OIMTrieMap } from './OIMTrieMap';

/**
 * Set-based index store keyed by a composite key path (`TOIMKeyPath`), backed by
 * a trie (`OIMTrieMap`) instead of a native `Map`. Key paths are matched by
 * content in O(arity) without building a string key. Buckets are carrier buckets
 * with the same live/reserved lifecycle as the Map-driven store.
 */
export class OIMIndexStoreTrieDrivenSetBased<
    TPk extends TOIMKey,
> extends OIMIndexStoreSetBased<TOIMKeyPath, TPk> {
    protected readonly slots = new OIMTrieMap<
        TOIMPk,
        OIMKeyedBucketSetBased<TOIMKeyPath, TPk>
    >();
    protected readonly reservedBuckets = new OIMTrieMap<
        TOIMPk,
        OIMKeyedBucketSetBased<TOIMKeyPath, TPk>
    >();

    getOrReserveBucket(
        key: TOIMKeyPath
    ): OIMKeyedBucketSetBased<TOIMKeyPath, TPk> {
        const live = this.slots.get(key);
        if (live) return live;
        let reserved = this.reservedBuckets.get(key);
        if (!reserved) {
            reserved = new OIMKeyedBucketSetBased<TOIMKeyPath, TPk>(key);
            this.reservedBuckets.set(key, reserved);
        }
        return reserved;
    }

    findBucket(
        key: TOIMKeyPath
    ): OIMKeyedBucketSetBased<TOIMKeyPath, TPk> | undefined {
        return this.slots.get(key) ?? this.reservedBuckets.get(key);
    }

    retainBucket(bucket: OIMKeyedBucketSetBased<TOIMKeyPath, TPk>): void {
        if (bucket.size === 0) return;
        this.reservedBuckets.delete(bucket.key);
        if (!this.slots.has(bucket.key)) this.slots.set(bucket.key, bucket);
    }

    releaseBucket(bucket: OIMKeyedBucketSetBased<TOIMKeyPath, TPk>): void {
        if (bucket.size > 0) return;
        this.slots.delete(bucket.key);
        if (bucket.hasSubscribers()) {
            this.reservedBuckets.set(bucket.key, bucket);
        } else {
            this.reservedBuckets.delete(bucket.key);
        }
    }

    dropIfReserved(key: TOIMKeyPath): void {
        const reserved = this.reservedBuckets.get(key);
        if (reserved && reserved.size === 0 && !reserved.hasSubscribers()) {
            this.reservedBuckets.delete(key);
        }
    }

    setOneByKey(
        key: TOIMKeyPath,
        slots: Set<TOIMAnyEntitySlot<TPk>>
    ): void {
        const bucket = this.getOrReserveBucket(key);
        if ((bucket as unknown) !== slots) {
            bucket.clear();
            for (const slot of slots) bucket.add(slot);
        }
        if (bucket.size > 0) this.retainBucket(bucket);
        else this.releaseBucket(bucket);
    }

    removeOneByKey(key: TOIMKeyPath): void {
        this.slots.delete(key);
        this.reservedBuckets.delete(key);
    }

    removeManyByKeys(keys: readonly TOIMKeyPath[]): void {
        for (let i = 0; i < keys.length; i++) {
            this.slots.delete(keys[i]);
            this.reservedBuckets.delete(keys[i]);
        }
    }

    getOneByKey(
        key: TOIMKeyPath
    ): Set<TOIMAnyEntitySlot<TPk>> | undefined {
        return this.slots.get(key);
    }

    getManyByKeys(
        keys: readonly TOIMKeyPath[]
    ): Map<TOIMKeyPath, Set<TOIMAnyEntitySlot<TPk>>> {
        const result = new Map<TOIMKeyPath, Set<TOIMAnyEntitySlot<TPk>>>();
        for (let i = 0; i < keys.length; i++) {
            const slots = this.slots.get(keys[i]);
            if (slots !== undefined) result.set(keys[i], slots);
        }
        return result;
    }

    getAllKeys(): TOIMKeyPath[] {
        return Array.from(this.slots.keys());
    }

    getAll(): Map<TOIMKeyPath, Set<TOIMAnyEntitySlot<TPk>>> {
        const result = new Map<TOIMKeyPath, Set<TOIMAnyEntitySlot<TPk>>>();
        for (const [path, bucket] of this.slots.entries()) {
            result.set(path, bucket);
        }
        return result;
    }

    countAll(): number {
        return this.slots.size;
    }

    clear(): void {
        for (const bucket of this.slots.values()) {
            bucket.clear();
            if (bucket.hasSubscribers()) {
                this.reservedBuckets.set(bucket.key, bucket);
            }
        }
        this.slots.clear();
    }
}
