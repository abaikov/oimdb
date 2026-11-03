---
sidebar_position: 1
description: Which package to take for which task, what each integration does, and which packages are stubs.
---

# Packages

One engine, `@oimdb/core`, and integrations built on it.

<InShort>

- `@oimdb/core` is the engine; everything else is an integration on top of it.
- Each integration uses only doors an application could call itself.
- An application pays in its bundle only for the integrations it imports.
- `@oimdb/async` and `@oimdb/snapshot-manager` are empty stubs.

</InShort>

## Which package for which task

| You want to… | Take | Where it is documented |
|---|---|---|
| hold entities, put them in buckets, derive values, subscribe | `@oimdb/core` | [The model](/docs/core/model) |
| render that state in React | `@oimdb/react` | [React](/docs/packages/react) |
| render that state with Exodra | `@oimdb/exodra` | [Exodra](/docs/packages/exodra) |
| keep part of the app in Redux and mirror OIMDB into it, or write back from reducers | `@oimdb/redux-adapter` | [Redux Adapter](/docs/packages/redux-adapter) |
| save collections to storage and load them back | `@oimdb/persist` plus one backend: `@oimdb/persist-idb`, `@oimdb/persist-localstorage`, `@oimdb/persist-async-kv`, `@oimdb/persist-memory`, `@oimdb/persist-json` | [Persist](/docs/packages/persist) |
| fill the store on the server and hand it to the client | `@oimdb/core` alone | [Server-side rendering](/docs/guides/ssr) |
| wire the database into the application and pick its strategies | `@oimdb/core` alone | [Dependency injection](/docs/guides/dependency-injection) |
| run every write from an orchestrator and let it decide when frames are delivered | `@oimdb/core` alone, with cnstra calling `flush()` | [OIMDB with cnstra](/docs/guides/with-cnstra) |
| name collections and inspect them while debugging | `@oimdb/devtools` | [below](#oimdbdevtools) |
| read live browser state from a shell (you or an AI assistant with a terminal) | `@oimdb/cli` | its [README](https://github.com/abaikov/oimdb/blob/master/packages/cli/README.md) |
| let an AI assistant without a shell read live browser state | `@oimdb/mcp` | its [README](https://github.com/abaikov/oimdb/blob/master/packages/mcp/README.md) |
| load data asynchronously | nothing extra: `await` the I/O, then write | [Stubs](#stubs) |
| read which entities changed since you last asked | nothing extra: an effect, a content-change listener, or `@oimdb/persist` | [Snapshot Manager](/docs/packages/snapshot-manager) |

Each integration takes a collection as a pair: the collection service, and the store slot that
is the instance.

## `@oimdb/devtools`

A debug registry: name your store slots and indexes and inspect them at run time. Keep the
registrations in `*.debug.ts` files next to the collections they describe, import them all from one
`debug.ts` that only your debug entry point imports, and build the services it should hear with
`defaults: OIM_DEV_DEFAULTS`; a production build then contains none of it. Its
[README](https://github.com/abaikov/oimdb/blob/master/packages/devtools/README.md) has the full
API. `@oimdb/cli` and `@oimdb/mcp` read the same registry.

## Stubs

- **`@oimdb/async`** is deprecated and exports nothing. Do the waiting outside the store: `await`
  your network or IndexedDB read, then write the result with
  `collectionService.writeSlotContentByKey(entityStoreSlot, key, entity)`. A pending request is
  ordinary state, an entity or a bucket you write when the request starts and again when it settles.
  [OIMDB with cnstra](/docs/guides/with-cnstra) shows the loading-then-data sequence written that way.
- **`@oimdb/snapshot-manager`** exports nothing either. [Snapshot Manager](/docs/packages/snapshot-manager)
  says what to use for each of its old jobs.

## Installing

See [Installation](/docs/getting-started/installation).
