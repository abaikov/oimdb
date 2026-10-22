# `OIMKeyedBucketArrayBased` — prose moved out of the source

Every block below stood in `OIMKeyedBucketArrayBased.ts` and is reproduced verbatim, with
the declaration it stood over.

## Over `export class OIMKeyedBucketArrayBased`

An array-based (ordered) index bucket that is ALSO its own subscription
carrier — the array counterpart of `OIMKeyedBucketSetBased`.

It extends `Array<slot>`, so every reader that treats a bucket as an ordered
slot array (iteration, `length`, index access, `push`, `filter`) is unchanged.
On top of that it carries `subscribers` + `dirty` (`IOIMSubscribable`) and its
own `key`, so the keyed emitter delivers straight off the bucket the writer
already holds (O(1), no key→carrier lookup).

`Symbol.species` is `Array`, so derived arrays (`filter`/`slice`/`map`) are
plain arrays — never stray carrier buckets.

## Over `public clear()`

Empty the bucket in place (Array has no `clear`).
