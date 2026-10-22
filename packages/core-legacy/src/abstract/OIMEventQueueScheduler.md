# `OIMEventQueueScheduler` — prose moved out of the source

Every block below stood in `OIMEventQueueScheduler.ts` and is reproduced verbatim, with the
declaration it stood over.

## Over `export abstract class OIMEventQueueScheduler`

Abstract base class for event queue schedulers.
Provides common event emission functionality while leaving scheduling strategy to subclasses.

## Over `protected flush()`

Trigger a flush event. Should be called by subclasses when they execute the scheduled flush.

## Over `protected unref<THandle>(handle)`

Detach a Node timer handle from the event loop, returning it unchanged.

A pending flush must never be a reason for a process to stay alive: if
nothing else is running there is no UI left to update, and the flush is
moot. Without this a scheduled-but-not-yet-run flush keeps Node awake —
which is why a test suite that leaves a queue scheduled reports
"a worker process has failed to exit gracefully".

In the browser `setTimeout` returns a number, which has no `unref`, so the
call is guarded and the handle passes straight through.
