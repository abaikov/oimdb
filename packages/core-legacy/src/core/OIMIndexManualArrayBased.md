# `OIMIndexManualArrayBased` — prose moved out of the source

Every block below stood in `OIMIndexManualArrayBased.ts` and is reproduced verbatim, with
the declaration it stood over.

## Over `export class OIMIndexManualArrayBased`

Manual Array-based (ordered) index with direct key→slots control.

Buckets are stable carrier buckets owned by the store (`getOrReserveBucket`):
a write mutates the SAME bucket in place and then calls `emitBucketChanged`,
so the reactive subclass delivers straight off that bucket in O(1). Emptied
buckets are released (kept only while subscribed).

## Over `public appendSlots(key, slots)`

Appends pre-deduplicated slots to a key's bucket IN PLACE and emits once.
O(added); callers own dedup.

## Over `public clear(key?)`

Clear all primary keys for a specific index key, or all keys if none given.

## Over `protected emitBucketChanged(bucket)`

Emit that a bucket changed. Base (non-reactive) path emits by key on the
plain event emitter; the reactive subclass overrides this to mark the
bucket carrier directly (O(1), no key→carrier lookup).
