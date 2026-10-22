# `OIMEventQueueSchedulerTimeout` — prose moved out of the source

Every block below stood in `OIMEventQueueSchedulerTimeout.ts` and is reproduced verbatim,
with the declaration it stood over.

## Over `export class OIMEventQueueSchedulerTimeout`

Timeout-based scheduler that executes flushes after a specified delay.
Useful for debouncing operations or creating custom timing strategies.

## Over `constructor(delay = 0)`

    @param delay - Delay in milliseconds before executing the flush (default: 0)
