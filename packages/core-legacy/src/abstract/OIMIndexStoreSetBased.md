# `OIMIndexStoreSetBased` — prose moved out of the source

Every block below stood in `OIMIndexStoreSetBased.ts` and is reproduced verbatim, with the
declaration it stood over.

## Over `abstract getOneByKey`

The live bucket for `key` (undefined if none / empty-reserved).

## Standing above the carrier-bucket lifecycle group

    // --- carrier-bucket lifecycle -------------------------------------------

A bucket is its own subscription carrier (`OIMKeyedBucketSetBased`). The
store owns bucket lifecycle so the reactive index can deliver straight off
the bucket it just wrote (O(1)), and a subscription can exist before its
data (an empty "reserved" bucket kept alive by its subscribers) — mirroring
the collection's live/reserved slot split.

## Over `abstract getOrReserveBucket`

Bucket for `key` (live or reserved), creating a reserved empty one if none.

## Over `abstract findBucket`

Existing bucket (live or reserved) without creating one — for delivery.

## Over `abstract retainBucket`

Promote a now-non-empty bucket into the live set.

## Over `abstract releaseBucket`

A now-empty bucket: keep it (reserved) if subscribed, else drop it.

## Over `abstract dropIfReserved`

Last subscriber left: drop the key's bucket if it is empty & unsubscribed.
