---
sidebar_position: 3
---

# Devtools

`@oimdb/devtools` is a zero-overhead debug registry. It gives your collections and indexes human-readable names, describes how they relate, and exposes runtime state for inspection — by you, by AI assistants, or by browser tooling.

Nothing in `@oimdb/devtools` ever runs in production: the debug registration files are only imported from your debug entry point, which is excluded from your production bundle.

## Installation

```bash
npm install @oimdb/devtools --save-dev
```

## The pattern

Keep business logic and debug registration in separate files, colocated:

```
src/store/
  users.ts          ← creates collection + indexes, exports them
  users.debug.ts    ← registers with devtools, never imported in prod
  tasks.ts
  tasks.debug.ts
src/debug.ts        ← imports all *.debug.ts — your debug entry point
```

## Registration

```ts
// users.debug.ts
import { registry } from '@oimdb/devtools';
import { usersCollection, byRole, byEmail } from './users';

registry.collection('users', usersCollection, {
    indexes: { byRole, byEmail },
    description: 'Registered app users',
});
```

```ts
// tasks.debug.ts
import { registry } from '@oimdb/devtools';
import { tasksCollection, byAssignee, byStatus } from './tasks';

registry.collection('tasks', tasksCollection, {
    indexes: { byAssignee, byStatus },
    relations: {
        assigneeId: 'users',  // tasks.assigneeId is a FK to the users collection
    },
});
```

```ts
// debug.ts — single entry point, import all debug files here
import './store/users.debug';
import './store/tasks.debug';
import './store/posts.debug';
```

## Inspecting at runtime

```ts
import { registry } from '@oimdb/devtools';

// Structured output — good for programmatic use
const state = registry.inspect();
console.log(state.collections.users.count);
console.log(state.collections.users.sampleEntity);

// Human-readable dump — good for console debugging
registry.dump();
```

`dump()` output:

```
[OIMDB DevRegistry]

  users (3 entities)
    fields:      id, name, role
    indexes:     byRole (2 keys), byEmail (3 keys)

  tasks (5 entities)
    fields:      id, title, assigneeId, status
    indexes:     byAssignee (2 keys), byStatus (3 keys)
    relations:   assigneeId → users
```

## Exposing to browser devtools

```ts
// debug.ts
import './store/users.debug';
import './store/tasks.debug';
import { registry } from '@oimdb/devtools';

if (typeof window !== 'undefined') {
    (window as Record<string, unknown>).__OIMDB_DEV__ = registry;
}
```

Then in the browser console:
```js
__OIMDB_DEV__.dump()
__OIMDB_DEV__.inspect()
```

## API

## Computed values

Register `OIMComputed` instances to see their status in `inspect()` and `dump()`:

```ts
// tasks.debug.ts
import { registry } from '@oimdb/devtools';
import { openTaskCount, totalPrice } from './tasks';

registry
    .collection('tasks', tasksCollection, { indexes: { byAssignee } })
    .computed('openTaskCount', openTaskCount)
    .computed('totalPrice', totalPrice);
```

`dump()` output includes a `computeds` section:

```
  computeds:
    openTaskCount            fresh  — value: 3
    totalPrice               stale  — last: 149.99
    filteredTasks            not computed yet
```

- **fresh** — value is up to date
- **stale** — deps changed since last compute; value shown is the previous one
- **not computed yet** — `queue.flush()` hasn't run since creation

This is the fastest way to find a broken selector: stale or never-computed entries point directly at the problem.

## API

### `registry.collection(name, collection, options?)`

Registers a collection. `collection` is duck-typed — any object with `getAll()` and `getAllPks()` works, including `OIMCollection` and `OIMReactiveCollection`.

| Option | Type | Description |
|---|---|---|
| `indexes` | `Record<string, { getKeys(): unknown[] }>` | Named indexes to expose |
| `relations` | `Record<string, string>` | FK field → target collection name |
| `description` | `string` | Optional human/AI description |

Returns `this` for chaining.

### `registry.computed(name, computed)`

Registers an `OIMComputed` instance by name. `computed` is duck-typed — any object with `needsRecompute: boolean`, `isReady: boolean`, and `getIfReady(): unknown` works.

Returns `this` for chaining.

### `registry.inspect()`

Returns a `TOIMDevInspectResult` with the current state of all registered collections and computed values.

### `registry.dump()`

Prints a formatted summary to `console.log`.

### `new OIMDevRegistry()`

Creates a fresh isolated registry. Useful for testing or multiple app instances. The named export `registry` is a singleton created with this constructor.
