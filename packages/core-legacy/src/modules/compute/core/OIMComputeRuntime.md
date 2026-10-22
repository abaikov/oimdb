# `OIMComputeRuntime` — prose moved out of the source

Every block below stood in `OIMComputeRuntime.ts` and is reproduced verbatim, with the
declaration or statement it stood over. Two blocks stayed in the source: the per-level drain
loop and the clear-before-run inside it, both of which state the order the statements under
them depend on.

## Over `export class OIMComputeRuntime`

Computative runtime that schedules derived computations by levels and runs them
on `queue.flush()` boundary (AFTER_FLUSH).

Buckets are held in an array indexed by topological level (levels are dense
small non-negative ints), not a `Map` — so the hot schedule/drain path indexes
directly with no hashing. The per-level `Set`s are POOLED: kept in their slot
and `.clear()`ed between flushes rather than re-allocated.

## Over `private minLevel`

Active level range (min > max means nothing pending).

## Over `private readonly levelByComputed`

Topological depth per computed node — the engine is the ONLY owner of
levels; nodes never expose their own. A node's dependents look up its depth
here (by the computed reference their dependency wraps). Written once at
construction, never on the hot flush path.

## Inside the constructor's AFTER_FLUSH handler

If nothing was scheduled, do nothing.

## Over `public get isDestroyed()`

Whether {@link destroy} has run. A destroyed runtime is detached from its
queue and must not be reused — `getOIMComputeRuntime` reads this to hand
out a fresh runtime instead of a dead one.

## Over `public destroy()`

Detach from the queue and drop everything pending.

Without this the AFTER_FLUSH subscription lives as long as the queue does,
even once every computed / effect on this runtime is gone — harmless (the
handler early-returns) but impossible to unwind. Destroying does NOT
destroy the nodes scheduled on it; destroy them first, then the runtime.
Idempotent.

## Over `public computeLevel(deps)`

Topological depth for a node with these dependencies: one above the deepest
computed dependency (source-only → 0). The engine owns this — callers pass
their dependencies and get back a level, they never compute it themselves.

## Over `public registerLevel(computed, level)`

Record a computed's depth so its dependents can look it up.

## Over `public getLevel(computed)`

The recorded topological depth of a computed (0 if unknown). Introspection.

## Over `public schedule(task, level)`

Schedule a one-shot task to run on the next `queue.flush()` (AFTER_FLUSH),
ordered by `level` ascending.

## Over `public scheduleAfterFlush(task)`

Run once at the start of the next runtime flush (i.e. after queue.flush()).
Useful for resubscribing dependencies exactly once per source flush.

## Inside `flush`, over `if (this.maxLevel > max) max = this.maxLevel`

If flush extended max level, pick it up.

## Inside `flush`'s `finally`, over `this.recomputePendingRange()`

Recompute the pending range over the pooled buckets. Normally
everything drained → nothing pending; if a task threw mid-drain,
whatever is left runs on the next queue.flush().
