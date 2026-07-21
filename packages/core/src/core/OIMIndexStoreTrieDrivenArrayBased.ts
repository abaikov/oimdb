import { TOIMPk } from '../types/TOIMPk';
import { TOIMKey } from '../types/TOIMKey';
import { TOIMKeyPath } from '../types/TOIMKeyPath';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMKeyedBucketArrayBased } from './OIMKeyedBucketArrayBased';
import { OIMTrieMap } from './OIMTrieMap';

/**
 * Array-based (ordered) index store keyed by a composite key path
 * (`TOIMKeyPath`), backed by a trie (`OIMTrieMap`). The array counterpart of
 * `OIMIndexStoreTrieDrivenSetBased`: each key path maps to an ordered carrier
 * bucket (`OIMKeyedBucketArrayBased`) with the same live/reserved lifecycle,
 * matched by content in O(arity) without building a string key.
 */
export class OIMIndexStoreTrieDrivenArrayBased<
    TPk extends TOIMKey,
> extends OIMIndexStoreArrayBased<TOIMKeyPath, TPk> {
    protected readonly slots = new OIMTrieMap<
        TOIMPk,
        OIMKeyedBucketArrayBased<TOIMKeyPath, TPk>
    >();
    protected readonly reservedBuckets = new OIMTrieMap<
        TOIMPk,
        OIMKeyedBucketArrayBased<TOIMKeyPath, TPk>
    >();

    getOrReserveBucket(
        key: TOIMKeyPath
    ): OIMKeyedBucketArrayBased<TOIMKeyPath, TPk> {
        const live = this.slots.get(key);
        if (live) return live;
        let reserved = this.reservedBuckets.get(key);
        if (!reserved) {
            reserved = new OIMKeyedBucketArrayBased<TOIMKeyPath, TPk>(key);
            this.reservedBuckets.set(key, reserved);
        }
        return reserved;
    }

    findBucket(
        key: TOIMKeyPath
    ): OIMKeyedBucketArrayBased<TOIMKeyPath, TPk> | undefined {
        return this.slots.get(key) ?? this.reservedBuckets.get(key);
    }

    retainBucket(bucket: OIMKeyedBucketArrayBased<TOIMKeyPath, TPk>): void {
        if (bucket.length === 0) return;
        this.reservedBuckets.delete(bucket.key);
        if (!this.slots.has(bucket.key)) this.slots.set(bucket.key, bucket);
    }

    releaseBucket(bucket: OIMKeyedBucketArrayBased<TOIMKeyPath, TPk>): void {
        if (bucket.length > 0) return;
        this.slots.delete(bucket.key);
        if (bucket.hasSubscribers()) {
            this.reservedBuckets.set(bucket.key, bucket);
        } else {
            this.reservedBuckets.delete(bucket.key);
        }
    }

    dropIfReserved(key: TOIMKeyPath): void {
        const reserved = this.reservedBuckets.get(key);
        if (reserved && reserved.length === 0 && !reserved.hasSubscribers()) {
            this.reservedBuckets.delete(key);
        }
    }

    setOneByKey(key: TOIMKeyPath, slots: TOIMAnyEntitySlot<TPk>[]): void {
        const bucket = this.getOrReserveBucket(key);
        if ((bucket as unknown) !== slots) {
            bucket.length = 0;
            for (let i = 0; i < slots.length; i++) bucket.push(slots[i]);
        }
        if (bucket.length > 0) this.retainBucket(bucket);
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
    ): TOIMAnyEntitySlot<TPk>[] | undefined {
        return this.slots.get(key);
    }

    getManyByKeys(
        keys: readonly TOIMKeyPath[]
    ): Map<TOIMKeyPath, TOIMAnyEntitySlot<TPk>[]> {
        const result = new Map<TOIMKeyPath, TOIMAnyEntitySlot<TPk>[]>();
        for (let i = 0; i < keys.length; i++) {
            const slots = this.slots.get(keys[i]);
            if (slots !== undefined) result.set(keys[i], slots);
        }
        return result;
    }

    getAllKeys(): TOIMKeyPath[] {
        return Array.from(this.slots.keys());
    }

    getAll(): Map<TOIMKeyPath, TOIMAnyEntitySlot<TPk>[]> {
        const result = new Map<TOIMKeyPath, TOIMAnyEntitySlot<TPk>[]>();
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
            bucket.length = 0;
            if (bucket.hasSubscribers()) {
                this.reservedBuckets.set(bucket.key, bucket);
            }
        }
        this.slots.clear();
    }
}
