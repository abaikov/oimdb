# @oimdb/devtools

Debug registry for OIMDB. It gives populations, indexes and derived values human-readable names, describes their relationships, and exposes runtime state for inspection by you, by AI assistants or by browser tooling.

📖 **[Full documentation](https://oimdb.org/)**

**No production path can reach this package, with one exception. The claim is about reachability, not byte count.**

Everything this package is *for* (naming populations, describing relationships, exposing runtime state) lives in debug files that only your debug entry point imports, so excluding that entry point excludes all of it. Nothing in this repository imports the registry from a production path. This is pinned by a test, not promised: `tests/what-a-production-bundle-can-reach.test.ts` reads the import graph and fails if a production module ever reaches a debug one.

**The exception is the error sink.** The engine's error policy, with its `onError`, is a *construction* option. That is deliberate: an error thrown before a sink was installed would otherwise be lost. So wiring the registry to it means importing `oimDevRegistry` where you construct the database, which is production code. See Setup below: that import is real, and dropping your debug entry point does not exclude it.

If you want the sink, you ship the reference to it. If you want a truly empty production bundle, construct the database with your own `onError` and let the debug entry point do the naming and inspecting, which is the part that carries the weight.

## For AI Assistants

If you are an AI assistant working on a project that uses OIMDB:

1. Read the full API reference at `node_modules/@oimdb/core/llms.txt` (CDN: `https://cdn.jsdelivr.net/npm/@oimdb/core/llms.txt`)
2. Look for `debug.ts` or `*.debug.ts` files in the project. They register populations, indexes and derived values by name and describe their relations. This is the fastest way to understand the app's data model.
3. If `@oimdb/mcp` is configured in the project's MCP settings, call `oimdb_inspect` to get the live runtime state directly from the running browser tab.

## Installation

```bash
npm install @oimdb/devtools --save-dev
```

Requires `@oimdb/core` 4.x as a peer.

## Mental Model

- **Registry**: a named map of what the engine holds. A registration is a live READ of a population, not a copy of it. `inspect()` reports whatever you registered as it is now.
- **debug file**: one `*.debug.ts` per domain, next to the store file. Never imported in production.
- **debug entry point**: a single `debug.ts` that imports all `*.debug.ts` files. Point AI at this file to understand the full data model.

## Setup

**Call `oimInitDevtools()` once at startup, before the app builds its first service or store slot.** Importing the package runs nothing. `oimInitDevtools()` installs the registry as core's store slot listener (`OIMDefaults.STORE_SLOT_LISTENER.setValue(oimDevRegistry)`), and that listener can only be set before the first service is built: after that, core has handed the default out and the call throws. `src/store/db.ts` below calls it before it builds the database.

The registry holds every store slot it hears, and every store slot you register, weakly. Devtools never keeps a store alive: a registered store that the app lets go drops out of the next report.

```ts file=src/store/db.ts
// src/store/db.ts
import { OIMDB, OIMErrorPolicyLogAndContinue } from '@oimdb/core';
import { oimDevRegistry, oimInitDevtools } from '@oimdb/devtools';

oimInitDevtools();

// The engine's error policy is a construction option, so the devtools sink is
// wired where the database is built — see `recordError` below.
export const db = new OIMDB({
    errorPolicy: new OIMErrorPolicyLogAndContinue({ onError: error => oimDevRegistry.recordError(error) }),
});
```

```ts file=src/store/users.ts
// src/store/users.ts
import { createOIMBucketService, createOIMEntityService, type TOIMEntitySlot } from '@oimdb/core';
import { db } from './db';

export type TUser = { id: string; name: string; role: string };

export const usersService = createOIMEntityService<TUser>(db, { keyOf: user => user.id });
export const users = usersService.createStoreSlot(db);

// A bucket's slots are yours: a write to a user moves the value and files
// nothing, so whoever writes the entity also calls `writeBucketMemberSlots(...)`.
export const usersByRoleService = createOIMBucketService<TOIMEntitySlot<TUser>>(db);
export const usersByRole = usersByRoleService.createStoreSlot(db);

export function fileUser(user: TUser, everyoneInThatRole: readonly TUser[]): void {
    const userContentService = usersService.slotContentService;
    userContentService.upsertEntity(users, user);
    const bucket = usersByRoleService.holdSlotByKey(usersByRole, user.role);
    usersByRoleService.slotContentService.writeBucketMemberSlots(
        bucket, everyoneInThatRole.map(u => userContentService.upsertEntity(users, u)),
    );
    bucket.owner.unholdSlot(bucket);
}
```

```ts file=src/store/tasks.ts
// src/store/tasks.ts
import {
    OIMSlotStoreServiceSingleSlotDriven, createOIMBucketService, createOIMComputedService,
    createOIMEntityService, oimSameValueZeroGuard,
    type TOIMComputedSlot, type TOIMEntitySlot, type TOIMSingleSlotStore,
} from '@oimdb/core';
import { db } from './db';

export type TTask = { id: string; title: string; assigneeId: string; done: boolean };

export const tasksService = createOIMEntityService<TTask>(db, { keyOf: task => task.id });
export const tasks = tasksService.createStoreSlot(db);
export const tasksByAssigneeService = createOIMBucketService<TOIMEntitySlot<TTask>>(db);
export const tasksByAssignee = tasksByAssigneeService.createStoreSlot(db);

const firstTask = tasksService.holdSlotByKey(tasks, 't1');
export const openTaskCountService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
    computedSlotStoreService:
        OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>,
    sameValueGuard: oimSameValueZeroGuard,
});
export const openTaskCount = openTaskCountService.createComputedStoreSlot(
    db,
    () => (firstTask.entity?.done === false ? 1 : 0),
    () => ({ sourceSlots: [firstTask] }),
);
```

```ts file=src/store/users.debug.ts
// src/store/users.debug.ts
import { oimDevRegistry } from '@oimdb/devtools';
import { users, usersByRole, usersByRoleService, usersService } from './users';

oimDevRegistry.collection('users', usersService, users, {
    // The bucket collection and its store slot — you constructed them, so you hand them over.
    indexes: { byRole: { bucketCollectionService: usersByRoleService, bucketStoreSlot: usersByRole } },
});
```

```ts file=src/store/tasks.debug.ts
// src/store/tasks.debug.ts
import { oimDevRegistry } from '@oimdb/devtools';
import {
    openTaskCount, openTaskCountService, tasks, tasksByAssignee, tasksByAssigneeService, tasksService,
} from './tasks';

oimDevRegistry
    .collection('tasks', tasksService, tasks, {
        indexes: { byAssignee: { bucketCollectionService: tasksByAssigneeService, bucketStoreSlot: tasksByAssignee } },
        relations: { assigneeId: 'users' },
        description: 'Work items assigned to users',
    })
    .computed('openTaskCount', openTaskCountService, openTaskCount);
```

```ts file=src/debug.ts
// src/debug.ts  ← your debug entry point, importing every *.debug.ts
import './store/users.debug';
import './store/tasks.debug';
import { oimDevRegistry } from '@oimdb/devtools';
import { db } from './store/db';

// One history entry per flush: how large every registered population was.
oimDevRegistry.trackFlushes(db);

// Optional: expose to browser console and OIMDB DevTools extension
if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__OIMDB_DEV__ = oimDevRegistry;
}
```

## Inspecting

```ts setup
import { OIMDB, OIMErrorPolicyLogAndContinue } from '@oimdb/core';
import { oimDevRegistry, oimInitDevtools } from '@oimdb/devtools';

oimInitDevtools();
```

```ts
// Structured output — good for programmatic use and AI
oimDevRegistry.inspect();

// Human-readable summary in console
oimDevRegistry.dump();
```

`dump()` output:

```
[OIMDB DevRegistry]

  users (3 entities)
    fields:      id, name, role
    indexes:     byRole (2 keys)

  tasks (5 entities)
    description: Work items assigned to users
    fields:      id, title, assigneeId, status
    indexes:     byAssignee (2 keys)
    relations:   assigneeId → users

  computeds:
    openTaskCount            value: 3
    totalPrice               value: 149.99
```

## API

### `oimDevRegistry.collection(name, entityCollectionService, entityStoreSlot, options?)`

Registers a population: one store slot of an entity collection (`entityStoreSlot = entityCollectionService.createStoreSlot(db)`), over any of the three key stores. The registry keeps a read of it, `entityCollectionService.getSlots(entityStoreSlot)`, so later writes and frames show up in every later report. The store slot is held weakly: once the app lets it go, the population is dropped from the report.

| Option | Type | Description |
|---|---|---|
| `indexes` | `Record<string, { bucketCollectionService: Pick<OIMSlotCollectionService<TOIMStoreKey, …>, 'getSlots'>; bucketStoreSlot: TOIMStoreSlot<…> }>` | Named buckets, keyed by whatever name you choose: a bucket collection (from `createOIMBucketService` or `createOIMIndexService`) and the store slot it made. These are the engine's own, so they cannot go stale behind the report. Each store slot is held weakly. |
| `relations` | `Record<string, string>` | FK field name → registered population name |
| `description` | `string` | Optional human/AI description |

A bucket service filed by a **chain** (one built over `OIMSlotStoreServiceTreeDriven`, on either walk) cannot be registered. The option is typed over `TOIMStoreKey` keys, so the compiler refuses it instead of reporting it under a name that would collide.

A **population** addressed that way can be registered, and each entity is reported by the keys of the identities in its chain, in order. That is the one name a reader could resolve back.

Returns `this`.

### `oimDevRegistry.computed(name, computedService, computedStoreSlot)`

Registers a single computed: a void-key `OIMComputedService` (`createOIMComputedService<void, TValue, TOIMSingleSlotStore<…>>({ computedSlotStoreService: OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as …, … })`) and the store slot from its `createComputedStoreSlot(db, derive, createSources)`. The report reads `computedCollectionService.getSlotByKey(computedStoreSlot, undefined)` and the value through `getValueForSlot`, which mints the computed slot if none is live and settles the derivation against its own clock, so the report shows what the graph answers at the moment it is taken. The store slot is held weakly, like a population's.

There is no "not computed yet" and no observable "stale". The sources are not reported either. They are `sourceSlots` and `sourceComputeds`, returned by `createSources` and carrying no names, so to see what a derivation depends on, read the `createComputedStoreSlot(...)` call in the source.

Returns `this`.

### `oimDevRegistry.onStoreSlotCreated(storeSlot)`

The `IOIMStoreSlotListener` hook core calls for every store slot it creates, once `oimDevRegistry` is installed as `OIMDefaults.STORE_SLOT_LISTENER`. It adds the store slot to a `WeakSet`. A store slot carries no name and no reader, so hearing one does not register it: it still has to be named with `collection(...)` or `computed(...)`.

### `oimDevRegistry.trackFlushes(channelMap): TOIMDisposer`

Takes the db (any `IOIMChannelMap`) and subscribes to its default channel slot's after-flush hook (`OIMChannelService.subscribeAfterEachFlush`) and records, once per flush, how many identities each registered population holds. Keeps the last 50 flushes, newest first, in `inspect().history`. Returns the disposer.

### `oimDevRegistry.recordError(error): void`

Records an error so `inspect().errors` surfaces it (and the MCP bridge with it). Keeps the last 50, newest first.

It is a sink rather than a subscription because there is nothing to subscribe to. The engine's error hook is the `onError` of `TOIMDBOptions.errorPolicy`, a **construction option**, so by the time a registry exists the decision has already been made. Wire it where the option is:

```ts
const debugDb = new OIMDB({
    errorPolicy: new OIMErrorPolicyLogAndContinue({ onError: error => oimDevRegistry.recordError(error) }),
});
```

A database constructed without that `onError` logs each error with `console.error`, and nothing reaches the registry at all.

### `oimDevRegistry.inspect(): TOIMDevInspectResult`

Returns a plain serializable object with the current state of every registered population and derived value. Safe to `JSON.stringify`.

Nothing is settled for the buckets. A bucket's slots are written by the call that writes them, and the report reads addresses rather than slots, so no order is observed. Derivations are settled, because that is what reading one means.

An entity slot whose value has been removed but whose identity is still held reports `undefined` in `entities`. That hole is what the engine holds there. Dropping it would report a population smaller than its own key list says it is.

### `oimDevRegistry.dump()` / `oimDevRegistry.dumpString()`

`dumpString()` builds the formatted summary and **returns** it; `dump()` passes
that result to `console.log`. Use `dumpString()` when you want the text rather
than the log line: to write it to a file, put it in a test assertion, or paste
it into a prompt. It is also what `@oimdb/mcp`'s `oimdb_dump` tool reads.

### `oimDevRegistry.connect(url?)`

Opens a WebSocket to the `@oimdb/mcp` bridge (`ws://localhost:7432` by default) and answers its `inspect` and `dump` requests. Browser only. Returns a disposer.

Those two requests are all it answers. A frame it cannot read (malformed JSON, a request with no `id`, an action it does not serve) is ignored and the socket stays open. The page has one bridge and no reconnect, and a frame with no `id` cannot be answered anyway, since the requester matches answers by `id`.

### `new OIMDevRegistry()`

Creates a fresh, isolated registry. The named export `oimDevRegistry` is a singleton. Use `new OIMDevRegistry()` in tests or when you need several independent registries.

## Using with AI

Point your AI assistant at `src/debug.ts`:

> "Check `src/debug.ts` and the files it imports to understand the data model."

In one pass the AI sees every population name, its entity shape, all indexes, all foreign-key relations and all registered derived values. That is enough to write correct queries, subscriptions and mutations without guessing.

You can also paste `oimDevRegistry.dumpString()` output directly into a prompt for a snapshot of current runtime state.
