---
sidebar_position: 4
---

# React

`@oimdb/react` provides hooks and a context provider. All hooks use `useSyncExternalStore` and re-render only when the specific data they watch actually changes.

```bash
npm install @oimdb/react @oimdb/core
```

## Setup

Create your store outside React, then pass collections through a Provider:

```typescript
// store.ts
import { createOIMCollectionKit, OIMEventQueue, OIMEventQueueSchedulerFactory } from '@oimdb/core';

const queue = new OIMEventQueue({
  scheduler: OIMEventQueueSchedulerFactory.createMicrotask(),
});

const users = createOIMCollectionKit<User, string>(queue, {
  selectPk: (u) => u.id,
});
const tasks = createOIMCollectionKit<Task, string>(queue, {
  selectPk: (t) => t.id,
});

export const byTeam  = users.indexFactory.derivedSetIndex((u) => u.teamId);
export const byStatus = tasks.indexFactory.derivedSetIndex((t) => t.status);

export const collections = {
  users: users.collection,
  tasks: tasks.collection,
};
```

```tsx
// App.tsx
import { OIMCollectionsProvider } from '@oimdb/react';
import { collections } from './store';

export function App() {
  return (
    <OIMCollectionsProvider collections={collections}>
      <TeamList teamId="team1" />
    </OIMCollectionsProvider>
  );
}
```

## Hooks

Access collections via `useOIMCollectionsContext`, then pass them to hooks:

```tsx
import { useOIMCollectionsContext, useSelectEntitiesByIndexKeySetBased, useSelectEntityByPk } from '@oimdb/react';
import { byTeam } from './store';

type AppCollections = typeof collections;

function TeamList({ teamId }: { teamId: string }) {
  const { users } = useOIMCollectionsContext<AppCollections>();
  const members = useSelectEntitiesByIndexKeySetBased(users, byTeam, teamId);

  return <ul>{members?.map(u => u && <li key={u.id}>{u.name}</li>)}</ul>;
}

function UserCard({ userId }: { userId: string }) {
  const { users } = useOIMCollectionsContext<AppCollections>();
  const user = useSelectEntityByPk(users, userId);

  return <span>{user?.name ?? '—'}</span>;
}
```

### Collection hooks

| Hook | Returns |
|---|---|
| `useSelectEntityByPk(collection, pk)` | `TEntity \| undefined` |
| `useSelectEntitiesByPks(collection, pks)` | `(TEntity \| undefined)[]` |
| `useSelectEntitiesByIndexKeySetBased(collection, index, key)` | `(TEntity \| undefined)[]` |
| `useSelectEntitiesByIndexKeysSetBased(collection, index, keys)` | `(TEntity \| undefined)[]` |
| `useSelectEntitiesByIndexKeyArrayBased(collection, index, key)` | `(TEntity \| undefined)[]` |
| `useSelectEntitiesByIndexKeysArrayBased(collection, index, keys)` | `(TEntity \| undefined)[]` |

### Index-only hooks (PKs without entities)

| Hook | Returns |
|---|---|
| `useSelectPksByIndexKeySetBased(index, key)` | `Set<TPk>` |
| `useSelectPksByIndexKeysSetBased(index, keys)` | `TPk[]` (flattened) |
| `useSelectPksByIndexKeyArrayBased(index, key)` | `TPk[]` |
| `useSelectPksByIndexKeysArrayBased(index, keys)` | `TPk[]` (flattened) |

### Object hooks

For `OIMReactiveObject` (settings, flags, single values):

| Hook | Returns |
|---|---|
| `useSelectValueByObjectKey(obj, key)` | `TValue \| undefined` |
| `useSelectValuesByObjectKeys(obj, keys)` | `(TValue \| undefined)[]` |

## Multiple contexts

If you have multiple independent app sections, create separate typed contexts instead of sharing the global one:

```tsx
import { createOIMCollectionsContext, OIMCollectionsProvider, useOIMCollectionsContext } from '@oimdb/react';

const AdminContext = createOIMCollectionsContext<{ users: typeof users.collection }>();

function AdminPanel() {
  return (
    <OIMCollectionsProvider collections={{ users: users.collection }} context={AdminContext}>
      <AdminContent />
    </OIMCollectionsProvider>
  );
}

function AdminContent() {
  const { users } = useOIMCollectionsContext(AdminContext);
  // ...
}
```
