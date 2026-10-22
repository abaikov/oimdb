# What @tanstack/store 0.11 is, and how this adapter drives it

Companion to `packages/bench/src/adapters/tanstack-store.ts`.

## The installed API

`@tanstack/store` 0.11.2 is a rewrite on an alien-signals reactive core
(`node_modules/@tanstack/store/src/alien.ts`, `src/atom.ts`). Its whole public
surface is `src/index.ts:1-4`: `Store`, `ReadonlyStore`, `createStore`,
`createAtom`, `createAsyncAtom`, `batch`, `flush`, `toObserver`, `shallow`
(also `dist/index.d.ts`). The `Derived` and `Effect` classes of the 0.7 line
are not exported any more. In 0.11:

- a writable store is `createStore(value)` → `Store<T>` (`src/store.ts:89-104`),
  written with `setState(updater)` (`src/store.ts:45-47`) and read with `.state`;
- a DERIVATION is `createStore(fn)` → `ReadonlyStore<T>`: a computed atom that
  tracks every `.state` read inside `fn` (`src/atom.ts:237-255`);
- the only subscriber is `.subscribe(fn)`, an internal effect over one store
  (`src/atom.ts:178-198`). Its first run reads the store to link the edge and
  does NOT call `fn`; every later run does.

`createAtom` is the primitive under `Store`, and lighter by one wrapper and three
bound methods, but the TanStack Store docs teach `Store` ("creating a new store
instance, which is a wrapper around your data", quick-start) and list `createAtom`
only as a reference signature, so every row here is a `Store`.

So a view is a derived store, and its consumer is `subscribe` on it. A
subscriber over several stores is a derived store over them, subscribed.

## How consumption is forced

A derived store is pull-based like any computed: it is recomputed only when
read. `subscribe` is what reads it — the effect re-runs from `flush`, which
`setState` calls after propagating (`src/atom.ts:261-268`) unless a `batch` is
open (`src/atom.ts:89-92`).

## Batching

`frame(run)` is `batch(run)` (`src/atom.ts:70-79`): `flush` is skipped while
`batchDepth > 0`, and the outermost `batch` drains the queued effects once.
`write`, `remove`, `setGroup`, `switchGroup` and the owner and pair seeding
write several stores and carry their own `batch`; batches nest. A method that
writes one store calls `setState` bare, because the setter flushes on its own.
`settle()` is therefore a no-op in the view, read and relation bindings; in the
churn and single bindings it only turns what the subscribers recorded into one
delivery.

## Equality

Every atom compares with `options.compare ?? Object.is` (`src/atom.ts:201`,
`:222`); `createStore` passes no options, so it is `Object.is`. A row patch builds
a new row object and always notifies. A derived store returning a string stops
there when the string is unchanged, which is what gives the column subscriber,
the cell wiring and the chain their narrowing. The derived stores that feed a
consumer an array return a FRESH array on every recompute, or `Object.is` would
tell the subscription nothing changed.

## What the views depend on

As in the preact adapter: a store per row, a bucket store per group holding the
row stores filed there, and a derived store per view reading its bucket and
every row store in it. A row moving in gets a new bucket array, so the
destination view's next recompute reads the newcomer's `.state` for the first
time and acquires the edge.

## Mount and unmount

`subscribe` does not call its callback on subscribe, so a churn subscriber
records its source's current value at mount by reading `.state` right after
subscribing; the wake count is only ever raised from the callback.
`unsubscribe` stops the effect and unlinks its deps; a derived store left with
no subscriber is `unwatched` and drops its own deps at once
(`src/alien.ts:101-128` → `src/atom.ts:56-62`), so a chain or diamond is torn
down synchronously, level by level.

`pin`, `holdRelation` and `holdSingle` deliver once after subscribing, untimed,
because a subscription delivers nothing at creation.
