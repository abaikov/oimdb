import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMKeyedBucketArrayBased } from '../core/OIMKeyedBucketArrayBased';

export abstract class OIMIndexStoreArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> {
    abstract setOneByKey(key: TKey, slots: TOIMAnyEntitySlot<TPk>[]): void;

    abstract removeOneByKey(key: TKey): void;

    abstract removeManyByKeys(keys: readonly TKey[]): void;

    /** The live bucket for `key` (undefined if none / empty-reserved). */
    abstract getOneByKey(key: TKey): TOIMAnyEntitySlot<TPk>[] | undefined;

    abstract getManyByKeys(
        keys: readonly TKey[]
    ): Map<TKey, TOIMAnyEntitySlot<TPk>[]>;

    abstract getAllKeys(): TKey[];

    abstract getAll(): Map<TKey, TOIMAnyEntitySlot<TPk>[]>;

    abstract countAll(): number;

    abstract clear(): void;

    // --- carrier-bucket lifecycle (mirrors the set-based store) --------------
    abstract getOrReserveBucket(
        key: TKey
    ): OIMKeyedBucketArrayBased<TKey, TPk>;
    abstract findBucket(
        key: TKey
    ): OIMKeyedBucketArrayBased<TKey, TPk> | undefined;
    abstract retainBucket(bucket: OIMKeyedBucketArrayBased<TKey, TPk>): void;
    abstract releaseBucket(bucket: OIMKeyedBucketArrayBased<TKey, TPk>): void;
    abstract dropIfReserved(key: TKey): void;
}
