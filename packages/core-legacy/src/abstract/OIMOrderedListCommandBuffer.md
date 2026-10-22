# `OIMOrderedListCommandBuffer` — prose moved out of the source

Every block below stood in `OIMOrderedListCommandBuffer.ts` and is reproduced verbatim,
with the declaration or statement it stood over. One block stayed in the source: the
constructor's note that the emitter's `AFTER_FLUSH` listener must register before
`onAfterFlush`, which states the order of the two statements under it.

## Over `export abstract class OIMOrderedListCommandBuffer`

Abstract base for position-addressed ordered-list command streams.

Holds the machinery that is independent of what *produces* the commands:
per-key command buffering with reset-coalescing, `after_flush` delivery via
{@link commandsEmitter}, and the pull-based consume/subscribe surface
({@link IOIMOrderedListCommandSource}). The driver lives in the subclass:
`OIMOrderedListCommandStream` appends commands from imperative writers;
`OIMOrderedListCommandStreamDiffDriven` appends them by diffing a reactive
index.

{@link getItemsByKey} is abstract — each driver reads the current order from
its own backing (a manual ordered index, or an external reactive index). It is
consulted only on the cold reset-coalescing path, so it stays off the hot
append path.

## Over `private readonly staleResetKeys`

Keys whose buffered leading `reset` is stale: an edit after the reset
should be folded into it, but we defer the (O(list-size)) rebuild to the
next read instead of redoing it on every subsequent edit in the batch.

## Over `public abstract getItemsByKey(key)`

Current ordered items for `key` (the driver's backing order).

## Over `private materializeStaleReset(key)`

Rebuild a deferred leading `reset` from the current order, once, at read
time. All the post-reset edits that were folded in are already reflected
in the driver's backing order, so a single rebuild here is equivalent to
having recomputed the reset on each of those edits.

## Inside `appendCommand`, over `cmds.length = 0`

A full reset supersedes everything buffered so far.

## Inside `appendCommand`, over `this.staleResetKeys.delete(key)`

A fresh reset is authoritative — drop any pending rebuild.

## Inside `appendCommand`, over `this.staleResetKeys.add(key)`

Once the batch starts with a reset, later structural edits fold
into it. Mark it stale and rebuild once, lazily, on the next read
(see materializeStaleReset) rather than rebuilding per edit.

## Over `protected createResetCommand(items)`

The one place where a slot array escapes into something that OUTLIVES the
read that produced it: a buffered `reset` is handed to consumers later, at
`after_flush`. Index buckets are live carriers mutated in place, so the
copy has to happen here — this is the boundary, and the only one.

Every other path either walks its slots once or builds its own array, so
`getSlotsByKey` stays copy-free for them.
