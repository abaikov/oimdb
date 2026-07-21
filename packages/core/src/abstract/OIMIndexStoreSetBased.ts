import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMKeyedBucketSetBased } from '../core/OIMKeyedBucketSetBased';

export abstract class OIMIndexStoreSetBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> {
    abstract setOneByKey(key: TKey, slots: Set<TOIMAnyEntitySlot<TPk>>): void;

    abstract removeOneByKey(key: TKey): void;

    abstract removeManyByKeys(keys: readonly TKey[]): void;

    /** The live bucket for `key` (undefined if none / empty-reserved). */
    abstract getOneByKey(
        key: TKey
    ): Set<TOIMAnyEntitySlot<TPk>> | undefined;

    abstract getManyByKeys(
        keys: readonly TKey[]
    ): Map<TKey, Set<TOIMAnyEntitySlot<TPk>>>;

    abstract getAllKeys(): TKey[];

    abstract getAll(): Map<TKey, Set<TOIMAnyEntitySlot<TPk>>>;

    abstract countAll(): number;

    abstract clear(): void;

    // --- carrier-bucket lifecycle -------------------------------------------
    // A bucket is its own subscription carrier (`OIMKeyedBucketSetBased`). The
    // store owns bucket lifecycle so the reactive index can deliver straight off
    // the bucket it just wrote (O(1)), and a subscription can exist before its
    // data (an empty "reserved" bucket kept alive by its subscribers) — mirroring
    // the collection's live/reserved slot split.

    /** Bucket for `key` (live or reserved), creating a reserved empty one if none. */
    abstract getOrReserveBucket(
        key: TKey
    ): OIMKeyedBucketSetBased<TKey, TPk>;

    /** Existing bucket (live or reserved) without creating one — for delivery. */
    abstract findBucket(
        key: TKey
    ): OIMKeyedBucketSetBased<TKey, TPk> | undefined;

    /** Promote a now-non-empty bucket into the live set. */
    abstract retainBucket(bucket: OIMKeyedBucketSetBased<TKey, TPk>): void;

    /** A now-empty bucket: keep it (reserved) if subscribed, else drop it. */
    abstract releaseBucket(bucket: OIMKeyedBucketSetBased<TKey, TPk>): void;

    /** Last subscriber left: drop the key's bucket if it is empty & unsubscribed. */
    abstract dropIfReserved(key: TKey): void;
}
