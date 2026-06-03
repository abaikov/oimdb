---
sidebar_position: 2
---

# Debugging

## The core idea

OIMDB collections and indexes are anonymous objects. The library has no global registry: there's no way to look up "all collections in the app" at runtime, and there are no string names anywhere in production code. This is intentional — it keeps the core lean and eliminates global state.

For debugging you add names yourself, in a separate debug layer that never reaches production.

## Setup

Install `@oimdb/devtools` as a dev dependency:

```bash
npm install @oimdb/devtools --save-dev
```

Create one debug file per domain, colocated with the store file it describes:

```ts
// src/store/users.ts — business logic, unchanged
export const usersCollection = new OIMReactiveCollection<User, string>(queue, {
    selectPk: (u) => u.id,
});
export const byRole = indexFactory.derivedSetIndex((u) => [u.role]);
export const byEmail = indexFactory.derivedSetIndex((u) => [u.email]);
```

```ts
// src/store/users.debug.ts — debug registration, excluded from prod bundle
import { registry } from '@oimdb/devtools';
import { usersCollection, byRole, byEmail } from './users';

registry.collection('users', usersCollection, {
    indexes: { byRole, byEmail },
});
```

```ts
// src/store/tasks.debug.ts
import { registry } from '@oimdb/devtools';
import { tasksCollection, byAssignee, byStatus } from './tasks';

registry.collection('tasks', tasksCollection, {
    indexes: { byAssignee, byStatus },
    relations: { assigneeId: 'users' },
});
```

Wire everything up in a single debug entry point:

```ts
// src/debug.ts
import './store/users.debug';
import './store/tasks.debug';
import './store/posts.debug';

// Optional: expose to browser devtools
import { registry } from '@oimdb/devtools';
if (typeof window !== 'undefined') {
    (window as Record<string, unknown>).__OIMDB_DEV__ = registry;
}
```

## Using with AI assistants

AI coding assistants (Claude, Copilot, Cursor, etc.) struggle with oimdb because they can't see inside `node_modules`, and they don't know what collections your app has, how they're named, or how they relate.

`debug.ts` solves this. Point your AI at it:

> "Check `src/debug.ts` and the files it imports to understand the data model."

The AI will see every collection name, its entity shape (via `sampleEntity`), all indexes, and all foreign-key relations in one pass. This is enough to generate correct queries, subscriptions, and mutations without guessing.

You can also paste the output of `registry.dump()` directly into your AI prompt for a quick snapshot of the current runtime state.

## Inspecting in the browser

During development, open the browser console and call:

```js
__OIMDB_DEV__.dump()
```

Output:

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

Or get structured data for scripting:

```js
const state = __OIMDB_DEV__.inspect();
state.collections.tasks.indexes.byAssignee.keys; // ['u1', 'u2']
```

## Excluding from production

In Vite, exclude the debug entry point using a build condition:

```ts
// vite.config.ts
export default defineConfig({
    build: {
        rollupOptions: {
            // debug.ts is only included in dev mode
        },
    },
    plugins: [
        {
            name: 'exclude-debug',
            transform(code, id) {
                if (id.endsWith('.debug.ts') && process.env.NODE_ENV === 'production') {
                    return 'export {}';
                }
            },
        },
    ],
});
```

In webpack, use `DefinePlugin` with a conditional import:

```ts
// src/debug.ts
if (process.env.NODE_ENV !== 'production') {
    await import('./store/users.debug');
    await import('./store/tasks.debug');
}
```

Or simply don't import `debug.ts` from your production entry point at all.
