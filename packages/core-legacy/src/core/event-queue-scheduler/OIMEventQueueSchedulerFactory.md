# `OIMEventQueueSchedulerFactory` — prose moved out of the source

Every block below stood in `OIMEventQueueSchedulerFactory.ts` and is reproduced verbatim,
with the declaration it stood over.

## Over `export class OIMEventQueueSchedulerFactory`

Factory for creating event queue schedulers.
Provides a convenient way to create schedulers with type-safe configuration.

## Over `static create<T>(type, ...args)`

Create a scheduler of the specified type with optional configuration.

## Over `static createMicrotask()`

Create a microtask scheduler (most common for general use).

## Over `static createAnimationFrame()`

Create an animation frame scheduler (ideal for UI updates).

## Over `static createTimeout(delay?)`

Create a timeout scheduler with optional delay.

## Over `static createImmediate()`

Create an immediate scheduler (setImmediate / MessageChannel / setTimeout(0)).

## Over `static createSync()`

Create a synchronous scheduler — flushes in the same call stack, no
batching. Debug/diagnostic use only (see {@link OIMEventQueueSchedulerSync}).
