# `OIMBucketCarrierProvider` — prose moved out of the source

Every block below stood in `OIMBucketCarrierProvider.ts` and is reproduced verbatim, with
the declaration it stood over.

## Over `export interface IOIMCarrierBucketStore`

The bucket-lifecycle surface a carrier provider needs from an index store —
implemented by both the set-based and array-based stores. `getOrReserveBucket`
creates a reserved (empty) bucket so a subscription can exist before its data;
`dropIfReserved` prunes such a bucket once its last subscriber leaves.

## Over `export class OIMBucketCarrierProvider`

Resolves an index key to its carrier — where the carrier IS the index bucket,
owned by the store. Mirrors the collection's slot-based provider: subscribers
live on the bucket, so on a write the reactive index marks the bucket it just
touched in O(1) with no key→carrier map/trie. Works uniformly for primitive
(Map) and composite (trie) stores, and for set- and array-based buckets.

`getOrReserveCarrier` creates a reserved (empty) bucket so a subscription can
exist before its data; `onCarrierEmptied` drops such a bucket once its last
subscriber leaves and it holds no slots.
