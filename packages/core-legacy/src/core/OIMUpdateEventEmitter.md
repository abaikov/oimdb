# `OIMUpdateEventEmitter` — prose moved out of the source

Every block below stood in `OIMUpdateEventEmitter.ts` and is reproduced verbatim, with the
declaration or statement it stood over.

## Over `export abstract class OIMUpdateEventEmitter`

Keyed pub/sub: who is subscribed, which keys changed, and how to notify them.

WHEN the notification happens is the one thing this class does not decide —
that is the subclass's whole job, and there are exactly three answers:

- {@link OIMUpdateEventEmitterQueued} — inside the next `queue.flush()`. The
  default: a reaction to changed data, coalesced per frame. Only this one
  refuses writes mid-frame, because only for this one is "mid-frame" a
  contradiction.
- {@link OIMUpdateEventEmitterAfterFlush} — once the frame is over. For
  consumers that ACCUMULATE a description of the frame (ordered-list command
  streams, changed-field tracking) and can only publish it complete.
- {@link OIMUpdateEventEmitterImmediate} — right now, no queue. For advancing
  a graph: a computed publishing its new value inside the effect phase, where
  queueing would stretch a three-link chain across three frames.

This used to be one class with a `deliveryMode` string, tested twelve times at
runtime — three times in each of the three mark methods, on the hot path, to
re-derive something fixed at construction. Worse, the mid-frame guard applied
to one mode only, which no signature said: you had to read the body to learn
that an immediate emitter is exempt.

## Over `protected abstract scheduleDelivery()`

Publish the keys collected so far — the subclass decides when that is.
Called only when something was actually collected.

## Over `public markUpdatedKeys(keys)`

Mark keys as updated and schedule delivery.

If there are no subscriptions, this is a no-op and does not allocate or retain keys.

## Inside `markUpdatedKeys`, over the `continue`

If no one is subscribed for this key, don't retain it.

## Over `protected readonly onFlush`

Stable handler reference to avoid allocating a new closure on every HAS_CHANGES.

## Inside `onFlush`, over the empty-handlers branch

Early exit if no handlers are registered

## Over `private notifyHandlers(handlers)`

Notifies all handlers for a key. The overwhelmingly common case is a
single subscriber per key (one component per pk), handled without any
allocation. For multiple subscribers a snapshot is taken so a handler may
(un)subscribe during iteration without corrupting the walk.

## Over `protected runSinglePass()`

Deliver updated keys and notify handlers once.
Re-entrant updates during delivery are forbidden and will throw in markUpdatedKeys().

## Inside `runSinglePass`, over the walk choice

`updatedKeys` only ever holds keys that have handlers (markUpdated*
filters), so M <= K. For M < K, walking the changed keys and probing
the map (sparse) does fewer lookups than walking the whole map.
The one exception is M === K — every subscribed key dirty, as from
markAllUpdated()/clear() — where iterating the map in place beats K
repeated get() re-hashes by ~7-10% (benchmarked, min-of-7). Switch
walks on that exact condition; both still probe membership, so either
is correct if subscriptions changed between mark and flush.

## Inside `destroy`

Clear all handlers to free memory

## Over `public getMetrics()`

Get performance metrics for monitoring and debugging

## Over `public hasSubscriptions()`

Check if there are any active subscriptions

## Over `public getHandlerCount(key)`

Get the number of handlers for a specific key

## Inside `unsubscribeFromKey`

Clean up empty handler sets to prevent memory leaks

If no one is subscribed anymore, don't keep this key pending.

If there are no subscriptions at all, drop any pending work and cancel scheduled flush.

## Inside `subscribeOnKeys`

Batch subscribe for better performance

Only track keys where we actually added the handler

Only unsubscribe from keys where we actually subscribed

## Inside `unsubscribeFromKeys`

Batch unsubscribe - more efficient than individual calls
