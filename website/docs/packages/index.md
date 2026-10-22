---
sidebar_position: 1
description: Which package to take for which task, what the core engine and each integration do, which packages are stubs, and why not to install from npm.
---

# Packages

This repository holds one engine and a set of integrations built on it. Every
page here is written against the current source.

<InShort>

- The repository holds one engine and a set of integrations built on it.
- Each integration is a consumer of doors the core already exposes.
- The core stays free of React, Redux, Exodra and storage.
- Some packages are stubs, and you should not install from npm.

</InShort>

## Which package for which task

Start from what you need to do. Each row gives the package and the page that
documents it.

| You want to… | Take | Where it is documented |
|---|---|---|
| hold entities, put them in buckets, derive values, subscribe | `@oimdb/core` | [The model](/docs/core/model) |
| render that state in React | `@oimdb/react` | [React](/docs/packages/react) |
| bind that state into an Exodra view with no re-render | `@oimdb/exodra` | [Exodra](/docs/packages/exodra) |
| keep part of the app in Redux and mirror OIMDB into it, or write back from reducers | `@oimdb/redux-adapter` | [Redux Adapter](/docs/packages/redux-adapter) |
| save collections to storage and load them back | `@oimdb/persist` plus one backend: `@oimdb/persist-idb`, `@oimdb/persist-localstorage`, `@oimdb/persist-async-kv`, `@oimdb/persist-memory`, `@oimdb/persist-json` | [Persist](/docs/packages/persist) |
| fill the store on the server and hand it to the client | `@oimdb/core` alone | [Server-side rendering](/docs/guides/ssr) |
| decide when frames are delivered from an orchestrator | `@oimdb/core` alone, with cnstra calling `flush()` | [Delivery with cnstra](/docs/guides/with-cnstra) |
| name collections and inspect them while debugging | `@oimdb/devtools` | its [README](https://github.com/abaikov/oimdb/blob/master/packages/devtools/README.md) — see below |
| let an AI assistant read live browser state | `@oimdb/mcp` | its [README](https://github.com/abaikov/oimdb/blob/master/packages/mcp/README.md) |
| load data asynchronously | nothing extra: `await` the I/O, then write | [Stubs](#stubs) |
| read which entities changed since you last asked | nothing extra: an effect, a content-change listener, or `@oimdb/persist` | [Snapshot Manager](/docs/packages/snapshot-manager) |

**Why the integrations are separate packages.** Each one consumes the same few
doors the core already exposes (`OIMEffectService.INSTANCE.subscribeEffect`,
`subscribeAfterEachFrame`, a hold, a content-change listener), and none of them
reaches into the engine through anything an application could not call itself.
So the core stays free of React, Redux, Exodra and storage, and an application
pays in its bundle only for the bridges it imports.

## `@oimdb/core` — the engine

[The model](/docs/core/model) documents it in full, against the current
source.

Three layers:

| Layer | What is in it |
|---|---|
| `src/engine/` | One folder per domain — `bucket/`, `channel/`, `collector/`, `column/`, `computed/`, `entity/`, `error/`, `index/`, `key/`, `schedule/`, `slot/`, `store/`. The stateless services and the data they run on: `OIMChannelService` and `TOIMChannelSlot` (frames, the effect queue, the clock), `OIMSlotOwnerService` and `OIMSlotOwner`, the slot stores and key walks, the entity content service `OIMSlotContentEntityService`, `TOIMStoreSlot`, `TOIMComputedSlot`, `OIMEffectService` and `TOIMEffect`, the collector services and release policies. |
| `src/facade/` | The collections, one subfolder per kind: `slot/` (`OIMSlotCollectionService`, `OIMSingleSlotService`), `bucket/` (the `OIMSlotContentBucketService*` strategies, `OIMBucketCommands`), `index/` (`OIMIndexService`, `OIMIndexServiceSortedArrayDriven`), `computed/` (`OIMComputedService`, `OIMComputedServiceSorted`, `OIMComputedServiceBucketMemo`). A service holds no data: each instance is a store slot, and a single is a store slot that holds one slot. |
| `src/factories/` | `OIMDB`, `OIMDefaults`, `OIMDefaultValue`, and the `create…` functions: the base layer `createOIMSlotContentEntityService`, `createOIMSlotCollectionService`, `createOIMSingleSlotService`; the convenience wrappers `createOIMEntityService`, `createOIMSingleEntityService`, `createOIMBucketService`, `createOIMSingleBucketService`; `createOIMIndexService`, `createOIMIndexServiceByCompositeKey`, `createOIMIndexServiceSortedArrayDriven`, `createOIMComputedService`, `createOIMComputedServiceSorted`, `createOIMComputedServiceBucketMemo`, and the two entity writers `createOIMEntityWriterInPlace` and `createOIMEntityWriterReplacing`. |

Three sentences carry the design:

1. **Four doors mint an identity**: writing a value, subscribing, taking a
   hold, and a service's `getSlotByKey(storeSlot, key)`, whose mint the unused-slot collector holds for the
   turn. There is no non-minting read.
2. **A slot goes when nothing refers to it**, and a reference is given back by
   the thing that took it.
3. **A fork is a strategy, not a decision.** Both strategies ship and you pick at
   construction.

One more rule runs through the whole surface: **the application writes a bucket's
slots**, and they are never derived from an entity, because what a bucket holds is a
fact about the *response* you composed, and no column can express absence. The one
exception is `OIMIndexService`, the other strategy of that fork. It files entities into buckets
by the key read off the entity, and maintains a bucket only once it is minted (read-only for users).

`src/index.ts` is the entire public surface, and every export is listed under
"Export reference" in
[`packages/core/README.md`](https://github.com/abaikov/oimdb/blob/master/packages/core/README.md).

## The integrations

What each package's `src/` imports from `@oimdb/core`.

| Package | What it is for | What it imports from the core |
|---|---|---|
| [`@oimdb/react`](/docs/packages/react) | React bindings | `IOIMChannelMap`, `OIMDB`, `OIMEffectService`, `OIMSlotCollectionService`, `OIMSlotContentBucketService`, `OIMComputedService`, `OIM_FROZEN_EMPTY_SLOTS`, `oimHoldSlots`, `oimRefreshSourceComputeds`, `oimSameKeySequence`, `oimUnholdSlotsIfAlive`, `TOIMDisposer`, `TOIMComputedSources`, `TOIMComputedStoreSlot`, `TOIMStoreSlot`, slot and column types |
| [`@oimdb/persist`](/docs/packages/persist) | Storage-agnostic persistence | `IOIMChannelMap`, `OIMChannelService`, `OIMContentChangeListenerService`, `OIMEffectService`, `OIMSlotCollectionService`, `OIMSingleSlotService`, `OIMSlotContentEntityService`, `OIMSlotContentBucketService`, `OIMColumnOwnerPushDriven`, `IOIMEntityWriter`, `IOIMContentChangeListener`, `TOIMChannelSlot`, `TOIMChannelClock`, `TOIMEffect`, `TOIMDisposer`, `TOIMStoreSlot`, slot types and slot helpers |
| [`@oimdb/redux-adapter`](/docs/packages/redux-adapter) | Mirror collections and bucket collections into Redux | `IOIMChannelMap`, `OIMChannelService`, `OIMContentChangeListenerService`, `OIMEffectService`, `OIMSlotCollectionService`, `OIMSlotContentEntityService`, `OIMSlotContentBucketService`, `OIMColumnOwnerPushDriven`, `IOIMContentChangeListener`, `TOIMEffect`, `TOIMDisposer`, `TOIMStoreSlot`, slot types |
| [`@oimdb/exodra`](/docs/packages/exodra) | Bridge into an [Exodra](https://exodra.org) reactive surface | `IOIMChannelMap`, `OIMChannelService`, `OIMEffectService`, `OIMSlotContentBucketService`, `TOIMEffect`, `TOIMComputedSlot`, `OIM_FROZEN_EMPTY_SLOTS`, `oimOrderedListCommandsOfTransition`, `oimRefreshSourceComputeds`, `oimSameKeySequence`, `TOIMOrderedListCommand`, slot types |

Each of them takes a collection as a pair: the collection service, and the store slot that
is the instance. A hold is taken through the identity's own owner —
`slot.owner.holdSlot(slot)` and `slot.owner.unholdSlot(slot)`, or
`collectionService.holdSlotByKey(storeSlot, key)` and `slot.owner.unholdSlot(slot)`; `oimHoldSlots` and
`oimUnholdSlotsIfAlive` do the same for a list. In `@oimdb/react`, `packages/react/src/holdWhileSubscribed.ts`
wraps the pair for `useOIMField`, so the entity slot it holds is given back after the subscription is
torn down; `useOIMValue` holds nothing of its own, because its effect holds what it
subscribes to; and `useOIMEntity`, `useOIMSlotsByKeys` and `useOIMBucketSlotsByKey`
call `holdSlotByKey(storeSlot, key)` / `owner.unholdSlot` directly.

There is no name-for-name map on this site. Read the page for the package you
want against `packages/<name>/src/`, and the core's own surface at
[The model](/docs/core/model).

## Stubs

- **`@oimdb/async`**: deprecated. Its `src/index.ts` is `export {}` and it
  declares no dependency on the core. Do the waiting outside the store: `await`
  your network or IndexedDB read, then write the result in with
  `collectionService.slotContentService.upsertEntities(entityStoreSlot, ...)`. There is no async collection because a
  write is synchronous and lands in a frame. A pending request is ordinary
  state, an entity or a bucket you write when the request starts and again when
  it settles, so it needs no second kind of collection.
  [Delivery with cnstra](/docs/guides/with-cnstra) shows the loading-then-data
  sequence written that way.
- **`@oimdb/snapshot-manager`**: likewise an empty stub. It keeps a
  page of its own at [Snapshot Manager](/docs/packages/snapshot-manager), which
  says what to use for each job.

  `src/index.ts` is `export {}`. For storage, knowing which entities moved since you
  last asked is `@oimdb/persist`'s job: `OIMPersistEntityWriter` reports each
  written entity slot to whoever called its `subscribeEntitySlotWritten`, and
  `OIMPersistResourceRecords` collects those slots until the next write batch
  writes them.

## `@oimdb/devtools` has no page here

The package is live. It exports `OIMDevRegistry`, an `oimDevRegistry` singleton,
`oimInitDevtools`, `TOIMDevCollectionOptions` and six inspection types, and `@oimdb/mcp` is built
on it: `packages/mcp/README.md:92` imports `oimDevRegistry` from it, `:131` imports
`OIMDevRegistry` and `oimInitDevtools`, and `:155` says that registry "satisfies it as it stands".

Its only documentation is
[`packages/devtools/README.md`](https://github.com/abaikov/oimdb/blob/master/packages/devtools/README.md),
so there is one text to keep in step with the source. It covers the
colocation pattern (`users.ts` beside `users.debug.ts`, one `debug.ts` importing
every `*.debug.ts`, nothing in production importing any of them), the
`oimInitDevtools()` call at startup, the registration call
`oimDevRegistry.collection(name, entityCollectionService, entityStoreSlot, { indexes, description })`, and the test
that pins the exclusion by reading the import graph
(`packages/devtools/tests/what-a-production-bundle-can-reach.test.ts`). The error sink
is the one exception: the error policy's `onError` is a construction option, so
wiring the registry to it puts a real import on a production path.

## What is on npm, and why installing it is the wrong move

Fourteen packages are on npm, all of them older than this tree. As the registry
reads, `@oimdb/core` is 3.12.1 against 4.0.0 here, `@oimdb/react` 2.2.0 against
3.0.0, and `@oimdb/persist` 3.2.0 against 4.0.0. So an `npm install` does not
fail, but it hands you the engine this one replaced. See
[Installation](/docs/getting-started/installation).
