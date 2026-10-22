# `OIMReactiveCollectionIndexManualSetBased` — prose moved out of the source

Every block below stood in `OIMReactiveCollectionIndexManualSetBased.ts` and is reproduced
verbatim, with the declaration or statement it stood over.

## Over `export class OIMReactiveCollectionIndexManualSetBased`

Collection-bound reactive Set-based index.

PK writes (`setPks`/`addPks`/`removePks`) resolve canonical entity slots
through the collection binding and delegate to the underlying index, which
keeps each key's pk→slot membership ON the bucket itself — so a write touches
the key's store bucket exactly once (no separate membership map/trie).

## Over the bound slot getter

Bound once so the hot pk-write path passes a stable function (no per-call
closure allocation).

Inside it:

A custom getter may not have a slot for this pk yet. Hold a transient
empty slot so the pk stays indexed and the entity materializes once it
exists (the collection-bound getter returns a reserved slot).

## Over the non-reserving resolve

Non-reserving resolve used by `removePks` to canonicalize a raw pk to its
`slot.pk` (the membership key) without creating a slot for an absent pk.

## Inside `removePks`

Membership is keyed by the canonical `slot.pk`. Map each raw pk to it
via the collection; if the slot is already gone (entity removed), fall
back to the pk itself — for the removal event the collection emits the
canonical pk, so it still matches.
