---
sidebar_position: 5
---

# Error handling

What happens when something **throws during a flush** — a subscriber, an effect, a computed, or any task the queue runs — and how to control it.

## The one rule

All change delivery runs inside `queue.flush()`. If a task throws there, the queue guarantees two things **no matter what**:

1. **The other tasks in that flush still run.** Each task is isolated, so one bad subscriber never silently starves the rest of the reactive graph.
2. **The queue never gets stuck.** Its internal flush state is always restored (via `try/finally`), so the *next* flush works normally. A thrown error can never leave the queue "wedged" (permanently mid-flush, dropping every future update).

Everything below is about the **third** thing — whether the error is *raised* or *handled* — which you control.

## Default: the error is raised, not swallowed

With no configuration, a task error is **loud**. After the flush finishes restoring its state, the error propagates:

- **Manual flush** (`queue.flush()` called directly, e.g. in tests or a sync scheduler): the error is thrown to *your* caller. Wrap the `flush()` call in `try/catch` if you want to handle it there.
- **Async / scheduled mode** (the default, `OIMEventQueueSchedulerImmediate` and friends): the flush runs inside a scheduler callback with no synchronous caller, so the error becomes a genuine **uncaught error** — `window.onerror` / the console in the browser, and an uncaught exception in Node (which, by Node's default, terminates the process unless you have a `process.on('uncaughtException')` handler).

This is deliberate: a bug in your reactive code should be **impossible to miss**, not quietly discarded.

If several tasks throw in one flush, they are combined into an `AggregateError` (each individual error is also emitted on the `FLUSH_ERROR` channel below).

## Overriding: `onError`

Pass `onError` to the queue to **handle** the error yourself. When it is set, the error is considered handled and is **not** re-raised out of `flush()`:

```ts
import { OIMEventQueue, OIMEventQueueSchedulerImmediate } from '@oimdb/core';

const queue = new OIMEventQueue({
    scheduler: new OIMEventQueueSchedulerImmediate(),
    onError: (error) => {
        // e.g. report to Sentry, log, increment a metric…
        reportToSentry(error);
    },
});
```

`onError` is called once per failing task, with the value that was thrown (which may not be an `Error`). Isolation and state-restoration still apply — `onError` only replaces the *raising* of the error, not the safety guarantees.

## Observing: the `FLUSH_ERROR` event

Independent of `onError`, the queue **always** emits a `FLUSH_ERROR` event per failing task. This is an *observation channel* for tooling — it never replaces the error being raised, it runs in addition to it.

```ts
import { EOIMEventQueueEventType } from '@oimdb/core';

queue.emitter.on(EOIMEventQueueEventType.FLUSH_ERROR, ({ error }) => {
    // payload type: TOIMFlushError = { error: unknown }
});
```

## Surfacing errors in DevTools / MCP

`@oimdb/devtools` can record flush errors so they show up in `inspect()` (and through the MCP bridge for an AI assistant) — even though the error is still raised as usual. Wire it up next to `trackFlushes`:

```ts
// debug.ts
import { registry } from '@oimdb/devtools';
import { EOIMEventQueueEventType } from '@oimdb/core';
import { queue } from './store';

registry.trackFlushes(handler =>
    queue.emitter.on(EOIMEventQueueEventType.AFTER_FLUSH, handler)
);
registry.trackFlushErrors(handler =>
    queue.emitter.on(EOIMEventQueueEventType.FLUSH_ERROR, handler)
);
```

The last 50 errors then appear as `errors` in `registry.inspect()` (most recent first, each `{ time, message }`), alongside the flush `history`.

## Summary

| Question | Answer |
|---|---|
| Do other tasks run if one throws? | **Yes** — each task is isolated. |
| Can the queue get stuck / stop delivering? | **No** — flush state is always restored. |
| Default with no `onError`? | Error is **raised** (thrown to a manual caller, or uncaught in async mode). |
| With `onError`? | Error is **handled** — not re-raised. |
| How do tools see failures? | `FLUSH_ERROR` event (always) → `registry.trackFlushErrors` → `inspect().errors` → MCP. |
