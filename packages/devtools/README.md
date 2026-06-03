# @oimdb/devtools

Debug registry for OIMDB. Gives collections, indexes, and computed values human-readable names, describes their relationships, and exposes runtime state for inspection — by you, by AI assistants, or by browser tooling.

Zero production overhead: debug files are only imported from your debug entry point, which you exclude from your production bundle.

## For AI Assistants

If you are an AI assistant working on a project that uses OIMDB:

1. Read the full API reference at `node_modules/@oimdb/core/llms.txt` (CDN: `https://cdn.jsdelivr.net/npm/@oimdb/core/llms.txt`)
2. Look for `debug.ts` or `*.debug.ts` files in the project — they register collections, indexes, and computeds by name and describe their relations. This is the fastest way to understand the app's data model.
3. If `@oimdb/mcp` is configured in the project's MCP settings, call `oimdb_inspect` to get the live runtime state directly from the running browser tab.

## Installation

```bash
npm install @oimdb/devtools --save-dev
```

## Mental Model

- **Registry** — a named map of instances. Holds a WeakMap so it can resolve any registered instance to its name.
- **debug file** — one `*.debug.ts` per domain, colocated with the store file. Never imported in production.
- **debug entry point** — a single `debug.ts` that imports all `*.debug.ts` files. Point AI at this file to understand the full data model.

## Setup

```ts
// src/store/users.ts
export const usersCollection = new OIMReactiveCollection<User, string>(queue, {
    selectPk: (u) => u.id,
});
export const byRole = indexFactory.derivedSetIndex((u) => [u.role]);
```

```ts
// src/store/users.debug.ts
import { registry } from '@oimdb/devtools';
import { usersCollection, byRole } from './users';

registry.collection('users', usersCollection, {
    indexes: { byRole },
});
```

```ts
// src/store/tasks.debug.ts
import { registry } from '@oimdb/devtools';
import { tasksCollection, byAssignee, openTaskCount } from './tasks';

registry
    .collection('tasks', tasksCollection, {
        indexes: { byAssignee },
        relations: { assigneeId: 'users' },
    })
    .computed('openTaskCount', openTaskCount);
```

```ts
// src/debug.ts  ← your debug entry point
import './store/users.debug';
import './store/tasks.debug';

import { registry } from '@oimdb/devtools';

// Optional: expose to browser console and OIMDB DevTools extension
if (typeof window !== 'undefined') {
    (window as Record<string, unknown>).__OIMDB_DEV__ = registry;
}
```

## Inspecting

```ts
// Structured output — good for programmatic use and AI
registry.inspect();

// Human-readable summary in console
registry.dump();
```

`dump()` output:

```
[OIMDB DevRegistry]

  users (3 entities)
    fields:      id, name, role
    indexes:     byRole (2 keys)

  tasks (5 entities)
    fields:      id, title, assigneeId, status
    indexes:     byAssignee (2 keys)
    relations:   assigneeId → users

  computeds:
    openTaskCount            fresh  — value: 3
    totalPrice               stale  — last: 149.99
                               deps: p1Subtotal, tasks.byStatus
    complexCalc              not computed yet
                               deps: p1Subtotal, (unregistered)
```

`(unregistered)` means a computed depends on something not yet registered in devtools. Go to the relevant `*.debug.ts` and add it.

## API

### `registry.collection(name, collection, options?)`

Registers a collection. Duck-typed — any object with `getAll()` and `getAllPks()` works.

| Option | Type | Description |
|---|---|---|
| `indexes` | `Record<string, { getKeys(): unknown[] }>` | Named indexes. Also added to the WeakMap so computed deps can resolve to them. |
| `relations` | `Record<string, string>` | FK field name → target collection name |
| `description` | `string` | Optional human/AI description |

Returns `this`.

### `registry.computed(name, computed)`

Registers an `OIMComputed` instance. Duck-typed — needs `needsRecompute: boolean`, `isReady: boolean`, `getIfReady(): unknown`, and optionally `deps: readonly unknown[]`.

Dep sources are resolved to names via the registry's WeakMap. Any dep whose source is not registered shows as `(unregistered)` in `dump()` and `inspect()`.

Returns `this`.

### `registry.inspect(): TOIMDevInspectResult`

Returns a plain serializable object with the current state of all registered collections and computeds. Safe to `JSON.stringify`.

### `registry.dump()`

Prints a formatted summary to `console.log`.

### `new OIMDevRegistry()`

Creates a fresh isolated registry. The named export `registry` is a singleton. Use `new OIMDevRegistry()` in tests or when you need multiple independent registries.

## Using with AI

Point your AI assistant at `src/debug.ts`:

> "Check `src/debug.ts` and the files it imports to understand the data model."

The AI will see every collection name, its entity shape, all indexes, all foreign-key relations, and all registered computeds in one pass — enough to write correct queries, subscriptions, and mutations without guessing.

You can also paste `registry.dump()` output directly into a prompt for a snapshot of current runtime state.
