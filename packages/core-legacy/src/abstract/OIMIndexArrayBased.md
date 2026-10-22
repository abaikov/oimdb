# `OIMIndexArrayBased` — prose moved out of the source

Every block below stood in `OIMIndexArrayBased.ts` and is reproduced verbatim, with the
declaration it stood over. One block stayed in the source: the `EMPTY_SLOTS` note, which
says what the `Object.freeze` under it is for.

## Over `protected readonly arrayStore`

The same store as `store`, narrowed to expose the carrier-bucket lifecycle.

## Over `public getSlotsByKey(key)`

A LIVE view of the bucket — no defensive copy.

The bucket is a stable carrier (it is also the subscription target), so a
write edits it in place rather than replacing it: whatever you hold here
changes under you at the next write. **Valid until the next write.** Read
it, or copy it yourself if you intend to keep or diff it.

It used to slice on every call. Nothing needed that: every caller either
walks the result once and drops it, or immediately builds its own array
anyway — the diff-driven stream sliced the slice, and the derived index
sorted a copy of the copy. The one place where an array genuinely
outlives the read is a `reset` command, and that copies at its own
boundary (`OIMOrderedListCommandBuffer.createResetCommand`).

This also aligns the contract with {@link OIMIndexSetBased.getSlotsByKey},
which has always handed back its live bucket.

## Over `public getSlotsByKeys(keys)`

Live views, one per key — same ownership rules as {@link getSlotsByKey}.

## Over `protected bucketMatchesComparator(bucket, newSlots)`

True if a comparator is set and considers `bucket`'s pks equal to
`newSlots` — i.e. a `setSlots` would be a no-op and should not emit.
