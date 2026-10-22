# `OIMSlotWriterFieldMasked` — prose moved out of the source

Every block below stood in `OIMSlotWriterFieldMasked.ts` and is reproduced verbatim, with
the declaration or statement it stood over.

## Over `export class OIMSlotWriterFieldMasked`

A writer that records WHICH fields a write actually changed, and suppresses
writes that changed nothing.

### Two levels of suppression

**Per write.** A field's bit is set only when the patch's value differs from
what the slot already holds. Writing `{name: 'a'}` over `name: 'a'` produces
an empty mask, so the slot is never marked dirty and nobody is woken. The
comparison rides along the loop that builds the mask — one `!==` per patch
key, measured at +0.5 ns against not comparing at all, and 5x CHEAPER on a
no-op write because the rest of the path is skipped.

**Per frame.** The first write of a frame also keeps a reference to the entity
as it then stood, and every later write in that frame compares against THAT
rather than against its immediate predecessor. A bit set by one write is
cleared again by a later write that restores the original value, so `a → b → a`
inside one frame ends with the field reported unchanged. This is the case the
whole mechanism exists for: a server push that rewrites a row to the value it
already had should cost nothing downstream.

### Why in-place updaters are rejected

The flush snapshot is a REFERENCE to the entity as it was. An in-place updater
mutates that same object, so the snapshot and the current value are one and the
same and every comparison reports "unchanged" — the writer would then suppress
everything, including real changes, and the collection would silently stop
notifying. That is not a weaker guarantee, it is a broken one, so the
constructor throws instead of documenting a footgun.

Use the plain {@link OIMSlotWriter} if allocation-free in-place updates matter
more than field precision; the two are alternatives, not layers.

## Over `private readonly queue: OIMEventQueue`

Read for `flushCount` alone: a slot stamps the frame its base belongs to,
and a stamp older than the current one means the base is stale and the slot
re-bases on this write. Comparing a counter replaces walking a list of
pending slots when a frame ends — the work is proportional to the slots
written NEXT, not to the ones written last.

## Over `public destroy()`, and inside its body

Nothing to detach: the writer keeps no subscription and no per-flush list.

    // No per-flush state outside the slots themselves.

## Inside `write`, over `if (current === undefined)`

A first write has nothing to compare against: every field the patch
carries goes from absent to a value, so it all counts as changed.

## Inside `write`, over `const isFirstOfFlush = ...`

Re-base when this is the first write of a new frame. The stamp answers
"is my base stale" with a comparison, so no one has to walk the slots
touched last frame to reset them.

## Inside `write`, over the `for (const field in patch)` loop

Compare against where the FRAME began, not against the previous write:
a field that goes a → b → a clears its own bit on the way back, so the
round trip costs nothing at delivery and needs no end-of-flush pass.

## Inside `write`, over the `after === NO_FIELDS && ...` early return

Nothing differs from the frame's starting point, and nothing did
before either — the write is a no-op for every reader.

## Inside `write`, over `if (changed === NO_FIELDS && reverted === NO_FIELDS)`

The value may still need writing even when the mask ends up empty: the
entity has to hold what the caller set.

## Detached block, standing above `assertNotInPlace` with no method of its own

It described a method that is not in the file; kept here rather than discarded.

> Drop the bits whose value is back to what the flush started with.
>
> Runs once per dirty slot at delivery, over the SET bits only — typically
> one. The registry's reverse lookup turns a bit back into the field name to
> compare.

## Over `private assertNotInPlace()`

Reject an in-place updater at construction: probe it with a throwaway
entity and see whether it hands back the same object it was given.
