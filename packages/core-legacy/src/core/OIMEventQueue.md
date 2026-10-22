# `OIMEventQueue` — prose moved out of the source

Every block below stood in `OIMEventQueue.ts` and is reproduced verbatim, with the
declaration or statement it stood over. Two blocks stayed in the source: the set swap at
the top of `flush()` and the participant settling inside its last `finally` — both state
the order of the statements they sit on.

## Over `protected tasksSpare`

Reused buffer swapped in during flush so the pending set is never copied
(no per-flush array snapshot) and new enqueues land in a fresh set.

## Over `protected flushing?`

The set currently being drained, so cancel() can also remove a task
mid-flush (a Set's for..of skips entries deleted before they're reached).

## Over `public enqueue(fn)`

Enqueue a one-shot task to run on the next flush. The function is stored
directly (no wrapper, no returned closure) and cancelled via {@link cancel}
by passing the same reference. Enqueuing the same reference twice is
idempotent — it is Set-deduped and runs once per flush.

## Over `public cancel(fn)`

Cancel a previously enqueued task by its reference; safe to call mid-flush.

## Over `public flushCount = 0`

How many flushes this queue has run. Used as a generation stamp by state
that lives for exactly one frame.

## Over `private readonly frameParticipants`

Things holding state for the duration of the current frame. Registered
only while they actually hold something, so a queue whose emitters never
deliver iterates an empty set.

## Over `public get isInFlush()`

True while the queue is delivering, INCLUDING the effect phase.

Effects run after the task drain, when the queue is technically idle, but
they are part of the same frame: their dependencies' change records are
still readable and a write from there would mutate state that the frame
has already reported. Writers therefore treat the whole span as "in flush".

## Over `public get isInEffectPhase()`

True only while the effect phase runs — for error messages that name it.

## Detached block, standing above `registerFrameParticipant` and describing `flush`

It sat directly above `registerFrameParticipant`'s own block, not above the method it
describes; kept here rather than discarded.

> Execute the tasks pending at the moment the flush starts — a single pass,
> not a drain-to-empty.
>
> The pending set is swapped out for an empty spare up front and the flush
> iterates that captured set. Tasks enqueued during the flush land in the
> fresh set and run on the NEXT flush, not this one. (Contrast
> `OIMComputeRuntime.flush()`, which re-reads its bucket per level and so
> does drain same-level tasks scheduled mid-flush.)

## Over `public registerFrameParticipant(participant)`

Register something that must settle before `FRAME_END` is announced. Safe
to call repeatedly — membership is a set. See {@link IOIMFrameParticipant}
for why this is not just a `FRAME_END` listener.

## Over `private endFrame()`

Settle every participant. They typically unregister themselves from inside
`endFrame()`, which a `Set` iteration tolerates: removing the element being
visited (or any already visited) is well-defined.

## Inside `flush`, over `this.scheduler?.cancel()`

If a flush was scheduled, manual flush supersedes it.

## Inside `flush`, over `this.flushCount++`

Monotonic frame counter. Anything holding per-flush state compares it
instead of subscribing: the stale-vs-current question is answered by a
read, not by a handler call on every flush.

## Inside `flush`, over `let errors: unknown[] | undefined`

Each task is isolated: one throwing task neither aborts the rest nor
(via the finally) leaves the queue wedged. Errors are collected and
dealt with AFTER state is restored.

## Inside `flush`, over the `FLUSH_ERROR` emit

Observation channel — emitted regardless of `onError` so
tooling (devtools / MCP) always sees the failure.

## Inside `flush`, at the top of the drain's `finally`

Runs even if the loop body itself throws (e.g. a throwing
`onError`) — the queue never stays in a half-flushed state.

## Inside `flush`, over `this.isRunningEffects = true`

The effect phase belongs to the frame: writes are refused here just as
they are during the task drain, and the carriers keep their change
records until it is over so an effect can read what moved.

## Inside `flush`, over `if (errors && this.onError === undefined)`

Loud by default: with no handler installed the error is NOT swallowed —
it propagates (uncaught in async/scheduled mode, thrown to the caller
of a manual `flush()`). A handler opts the app into handling it.

## Inside `flush`, over the `AggregateError` lookup

Combine into an AggregateError when the runtime has it (all the
individual errors were already surfaced via FLUSH_ERROR). Referenced
via globalThis so consumers on an older `lib` still type-check.

## Inside `ensureScheduled`, over `this.scheduler.schedule()`

Only schedule when transitioning from empty to non-empty.
