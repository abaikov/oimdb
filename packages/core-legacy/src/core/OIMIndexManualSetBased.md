# `OIMIndexManualSetBased` — prose moved out of the source

Every block below stood in `OIMIndexManualSetBased.ts` and is reproduced verbatim, with the
declaration or statement it stood over. One block stayed in the source: the "replace bucket
contents first, then rebuild membership" note in `setPks`, which states the order of the
statements under it.

## Over `export class OIMIndexManualSetBased`

Manual Set-based index with direct key→slots control.

Buckets are stable carrier buckets owned by the store (`getOrReserveBucket`):
a write mutates the SAME bucket in place and then calls `emitBucketChanged`,
so the reactive subclass delivers straight off that bucket in O(1). Emptied
buckets are released (kept only while subscribed); the store keeps a
subscribed-but-empty bucket alive so a subscription survives a key going empty
and re-filling.

## Standing above the pk-oriented write group

pk-oriented writes: resolve the bucket ONCE and use its own membership
(pk → slot) for dedup/removal, so a composite (trie) key is walked a single
time instead of once for the bucket and once for a separate membership map.

## Inside `setPks`, over the membership rebuild loop

Keyed by the canonical `slot.pk` (one reference per logical key), so a
native `Map` is correct for composite pks too — no content-addressing.

## Inside `addPks`, over the `continue`

Dedup by the canonical slot reference (works for composite pks).

## Over `public removePks(key, pks)`

Removes by pk. `pks` must be canonical `slot.pk` references (membership is
keyed by them): for primitive pks that is just the pk; a collection-bound
composite index canonicalizes raw pks to `slot.pk` before calling this.

## Inside `removePks`, over `this.membershipOf(bucket)`

Seed membership from the bucket's slots if it was populated through the
lower-level `setSlots` path (so remove-by-pk still works).

## Over `private membershipOf(bucket)`

The bucket's pk → slot membership, lazily created and seeded from the
bucket's current slots (so it stays correct even if slots were written
through the lower-level `setSlots` path).

## Inside `replaceBucketContents`, in the no-comparator branch

No comparator: replace in place with no throwaway Set allocation.

## Over `public addSlots(key, slots)`

Adds slots to a key's bucket IN PLACE and emits once. O(added).

## Over `public removeSlots(key, slots)`

Removes slots from a key's bucket IN PLACE (O(removed)) and emits once.

## Over `public clear(key?)`

Clear all primary keys for a specific index key, or all keys if none given.

## Over `protected emitBucketChanged(bucket)`

Emit that a bucket changed. Base (non-reactive) path emits by key on the
plain event emitter; the reactive subclass overrides this to mark the
bucket carrier directly (O(1), no key→carrier lookup).
