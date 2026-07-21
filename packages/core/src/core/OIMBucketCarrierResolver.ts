import { TOIMKey } from '../types/TOIMKey';
import { IOIMCarrierResolver } from './OIMCarrierKeyedEmitter';
import { IOIMSubscribable } from '../types/IOIMSubscribable';

/**
 * The bucket-lifecycle surface a carrier resolver needs from an index store —
 * implemented by both the set-based and array-based stores. `getOrReserveBucket`
 * creates a reserved (empty) bucket so a subscription can exist before its data;
 * `dropIfReserved` prunes such a bucket once its last subscriber leaves.
 */
export interface IOIMCarrierBucketStore<
    TKey extends TOIMKey,
    TBucket extends IOIMSubscribable,
> {
    getOrReserveBucket(key: TKey): TBucket;
    findBucket(key: TKey): TBucket | undefined;
    dropIfReserved(key: TKey): void;
}

/**
 * Resolves an index key to its carrier — where the carrier IS the index bucket,
 * owned by the store. Mirrors the collection's slot-based resolver: subscribers
 * live on the bucket, so on a write the reactive index marks the bucket it just
 * touched in O(1) with no key→carrier map/trie. Works uniformly for primitive
 * (Map) and composite (trie) stores, and for set- and array-based buckets.
 *
 * `getOrReserveCarrier` creates a reserved (empty) bucket so a subscription can
 * exist before its data; `onCarrierEmptied` drops such a bucket once its last
 * subscriber leaves and it holds no slots.
 */
export class OIMBucketCarrierResolver<
    TKey extends TOIMKey,
    TBucket extends IOIMSubscribable & { readonly key: TKey },
> implements IOIMCarrierResolver<TKey, TBucket>
{
    constructor(
        private readonly store: IOIMCarrierBucketStore<TKey, TBucket>
    ) {}

    public getOrReserveCarrier(key: TKey): TBucket {
        return this.store.getOrReserveBucket(key);
    }

    public findCarrier(key: TKey): TBucket | undefined {
        return this.store.findBucket(key);
    }

    public onCarrierEmptied(carrier: TBucket): void {
        this.store.dropIfReserved(carrier.key);
    }
}
