# `OIMEffect` — prose moved out of the source

Every block below stood in `OIMEffect.ts` and is reproduced verbatim, with the declaration
or statement it stood over. One block stayed in the source: the "already reported this
frame" note in `onSourceInvalidate`, which is what the comparison under it means.

## Over `private readonly level: number`

Topological depth, owned by the runtime — one above the deepest computed
dependency (source-only effects are `0`). Passed to `runtime.schedule` so
this node runs only after everything it depends on. Internal: nodes never
expose their own level.

## Over `private reportedInFlush = -1`

The flush this effect last reported in. Comparing it against the queue's
counter is the whole muting mechanism: it says "already reported this
frame" without scheduling anything.

The previous version enqueued an unmute task on every invalidation — a
closure, a `Set` insert, and a pass over `afterFlushTasks` in the runtime,
all to flip one boolean at the start of the next flush. Profiled at ~7% of
the write path for bookkeeping a comparison answers for free.

## Over the constructor's `level?` parameter

A computed passes its already-computed level; standalone effects let
the runtime derive it from their dependencies.

## Over `public get isActive()`

Whether this effect is currently listening. An inactive effect keeps its
dependency list and its identity but holds no subscriptions, so it costs
nothing and cannot fire.

## Over `public activate()`

Start listening. Idempotent.

Exists so a consumer whose lifetime is shorter than the effect's — a
selector with no watchers, an effect bound to a mounted component — can
stop paying for subscriptions without destroying and rebuilding the node.

## Over `public deactivate()`

Stop listening, keeping the effect reusable. Any run already scheduled for
this flush is cancelled: an inactive effect must not fire.
